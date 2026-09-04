import { z } from "zod"

import { prisma } from "@/lib/db"
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "@/lib/emails"
import type { OrderEmailSnapshot } from "@/lib/emails"
import { OrderStatus } from "@/lib/generated/prisma/client"
import { totalPayable } from "@/lib/money"
import { ORDER_TRANSITIONS } from "@/lib/order-status"
import { lirePanierClient } from "@/lib/panier"
import { invalidateCommande } from "@/lib/use-cases/cache-invalidation"
import {
  deliveryAddressField,
  deliveryPhoneField,
} from "@/lib/use-cases/contact"
import { chargerDevis } from "@/lib/use-cases/devis"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"
import type { OrderEffects as LegacyOrderEffects } from "@/lib/use-cases/order-effects"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export type OrderEffects = {
  sendOrderPlacedEmail(order: OrderEmailSnapshot): Promise<void>
  sendOrderStatusEmail(
    order: OrderEmailSnapshot,
    newStatus: OrderStatus
  ): Promise<void>
  invalidateOrder(orderId: string): void
}

const defaultOrderEffects: OrderEffects = {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  invalidateOrder: (orderId) => invalidateCommande(orderId),
}

export interface CheckoutInput {
  cityId: string
  address: string
  phone: string
}

export interface OutOfStockItem {
  productName: string
  variantName: string
  requested: number
  available: number
}

export interface OrderItemDetail {
  id: string
  productName: string
  variantName: string
  price: number
  quantity: number
}

export interface OrderDetail {
  id: string
  status: OrderStatus
  cityName: string
  address: string
  phone: string
  total: number
  shippingFee: number
  totalPayable: number
  createdAt: Date
  items: OrderItemDetail[]
}

export interface OrderSummary {
  id: string
  status: OrderStatus
  total: number
  shippingFee: number
  totalPayable: number
  createdAt: Date
  itemCount: number
}

export class CheckoutValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "CheckoutValidationError"
  }
}

export class EmptyCartError extends UserFacingError {
  constructor() {
    super("Votre panier est vide")
    this.name = "EmptyCartError"
  }
}

export class OutOfStockError extends UserFacingError {
  items: OutOfStockItem[]

  constructor(items: OutOfStockItem[]) {
    const details = items
      .map(
        (item) =>
          `« ${item.productName} ${item.variantName} » : ${item.requested} demandé(s), ${item.available} disponible(s)`
      )
      .join(" ; ")
    super(`Stock insuffisant : ${details}`)
    this.name = "OutOfStockError"
    this.items = items
  }
}

export class OrderNotFoundError extends UserFacingError {
  constructor() {
    super("Commande introuvable")
    this.name = "OrderNotFoundError"
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("Utilisateur introuvable")
    this.name = "UserNotFoundError"
  }
}

export class InvalidOrderTransitionError extends UserFacingError {
  constructor(fromStatus: string, nextStatus: string) {
    super(`Transition invalide : ${fromStatus} → ${nextStatus}`)
    this.name = "InvalidOrderTransitionError"
  }
}

const checkoutInputSchema = z.object({
  cityId: z.string().min(1, "ville de livraison requise"),
  address: deliveryAddressField,
  phone: deliveryPhoneField,
})

function parseCheckoutInput(input: CheckoutInput): CheckoutInput {
  const result = checkoutInputSchema.safeParse(input)
  if (!result.success) {
    throw new CheckoutValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function isOrderStatus(value: string): value is OrderStatus {
  return (Object.values(OrderStatus) as string[]).includes(value)
}

type OrderWithItems = {
  id: string
  cityName: string
  address: string
  phone: string
  total: number
  shippingFee: number
  items: {
    productName: string
    variantName: string
    price: number
    quantity: number
  }[]
}

function toOrderEmailSnapshot(
  order: OrderWithItems,
  userEmail: string
): OrderEmailSnapshot {
  return {
    userEmail,
    orderId: order.id,
    items: order.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
    })),
    total: order.total,
    shippingFee: order.shippingFee,
    totalPayable: totalPayable(order),
    cityName: order.cityName,
    address: order.address,
    phone: order.phone,
  }
}

export async function placeOrder(
  userId: string,
  input: CheckoutInput,
  effects: LegacyOrderEffects
) {
  const data = parseCheckoutInput(input)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) throw new UserNotFoundError()

  const cart = await lirePanierClient(userId)
  if (cart.lines.length === 0) throw new EmptyCartError()

  const devis = await chargerDevis(cart, data.cityId)
  if (devis.cas === "aucune") throw new DeliveryCityNotFoundError()
  const city = devis.ville
  const shippingFee = devis.devis.shippingFee

  const outOfStock = cart.lines
    .filter((line) => line.quantity > line.stock)
    .map((line) => ({
      productName: line.productName,
      variantName: line.variantName,
      requested: line.quantity,
      available: line.stock,
    }))
  if (outOfStock.length > 0) throw new OutOfStockError(outOfStock)

  const order = await prisma.$transaction(async (tx) => {
    for (const line of cart.lines) {
      const updated = await tx.productVariant.updateMany({
        where: { id: line.variantId, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      })
      if (updated.count === 0) {
        const current = await tx.productVariant.findUnique({
          where: { id: line.variantId },
          select: { stock: true },
        })
        throw new OutOfStockError([
          {
            productName: line.productName,
            variantName: line.variantName,
            requested: line.quantity,
            available: current?.stock ?? line.stock,
          },
        ])
      }
    }

    const created = await tx.order.create({
      data: {
        userId,
        cityName: city.name,
        address: data.address,
        phone: data.phone,
        total: cart.subtotal,
        shippingFee,
        items: {
          create: cart.lines.map((line) => ({
            variantId: line.variantId,
            productName: line.productName,
            variantName: line.variantName,
            price: line.unitPrice,
            quantity: line.quantity,
          })),
        },
      },
      include: { items: true },
    })

    await tx.cartItem.deleteMany({
      where: { id: { in: cart.lines.map((line) => line.articlePanierId) } },
    })
    return created
  })

  try {
    await effects.sendOrderPlacedEmail(toOrderEmailSnapshot(order, user.email))
  } catch (error) {
    console.warn(
      `[order] e-mail de confirmation non envoyé pour ${order.id}`,
      error
    )
  }
  return order
}

export async function getOrder(
  userId: string,
  orderId: string
): Promise<OrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { items: true },
  })
  if (!order) return null

  return {
    id: order.id,
    status: order.status,
    cityName: order.cityName,
    address: order.address,
    phone: order.phone,
    total: order.total,
    shippingFee: order.shippingFee,
    totalPayable: totalPayable(order),
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
    })),
  }
}

export async function listUserOrders(userId: string): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { quantity: true } } },
  })
  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    total: order.total,
    shippingFee: order.shippingFee,
    totalPayable: totalPayable(order),
    createdAt: order.createdAt,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
  }))
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: string,
  overrides?: Partial<OrderEffects>
) {
  const effects = { ...defaultOrderEffects, ...overrides }
  if (!isOrderStatus(nextStatus))
    throw new InvalidOrderTransitionError("inconnu", nextStatus)

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true } } },
  })
  if (!existing) throw new OrderNotFoundError()
  if (!ORDER_TRANSITIONS[existing.status].includes(nextStatus)) {
    throw new InvalidOrderTransitionError(existing.status, nextStatus)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })
    if (!fresh) throw new OrderNotFoundError()
    if (!ORDER_TRANSITIONS[fresh.status].includes(nextStatus)) {
      throw new InvalidOrderTransitionError(fresh.status, nextStatus)
    }

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: fresh.status },
      data: { status: nextStatus },
    })
    if (claimed.count === 0) {
      throw new InvalidOrderTransitionError(fresh.status, nextStatus)
    }

    if (nextStatus === "cancelled" || nextStatus === "returned") {
      for (const item of fresh.items) {
        if (!item.variantId) continue
        await tx.productVariant.updateMany({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        })
      }
    }

    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    })
  })

  try {
    await effects.sendOrderStatusEmail(
      toOrderEmailSnapshot(updated, existing.user.email),
      updated.status
    )
  } catch (error) {
    console.warn(`[order] e-mail de statut non envoyé pour ${orderId}`, error)
  }
  try {
    effects.invalidateOrder(orderId)
  } catch (error) {
    console.warn(
      `[order] invalidation du cache non effectuée pour ${orderId}`,
      error
    )
  }
  return updated
}
