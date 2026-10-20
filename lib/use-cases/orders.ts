import { z } from "zod"

import type { CommandeListingParams } from "@/lib/commande-listing"
import { prisma } from "@/lib/db"
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "@/lib/emails"
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client"
import { peutTransitionner, réapprovisionne } from "@/lib/statut-de-commande"
import { PAGE_SIZES } from "@/lib/table-config"
import { lirePanierClient } from "@/lib/panier"
import { invalidateCommande } from "@/lib/use-cases/cache-invalidation"
import {
  deliveryAddressField,
  deliveryPhoneField,
} from "@/lib/use-cases/contact"
import {
  chargerDevis,
  projeterDevis,
  selectionValidee,
} from "@/lib/use-cases/devis"
import { montantsDeLaCommande } from "@/lib/use-cases/montants-commande"
import {
  avecSurcharges,
  messageDeValidation,
  runOrderedEffects,
} from "@/lib/use-cases/mutation-squelette"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export type OrderEffects = {
  sendOrderPlacedEmail(order: OrderEmailSnapshot): Promise<void>
  sendOrderStatusEmail(
    order: OrderEmailSnapshot,
    newStatus: OrderStatus
  ): Promise<void>
  invalidateCommande(orderId: string): void
}

const defaultOrderEffects: OrderEffects = {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  invalidateCommande,
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

export type AdminOrderItem = OrderItemDetail

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

export type AdminOrderDetail = OrderDetail & {
  customerName: string
  customerEmail: string
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

export type AdminOrderSummary = OrderSummary & {
  customerName: string
  customerEmail: string
}

export interface AdminOrdersPage {
  orders: AdminOrderSummary[]
  totalCount: number
  pageCount: number
}

export class CheckoutValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
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
  constructor(fromStatus: OrderStatus, nextStatus: OrderStatus) {
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

type OrderWithItems = {
  id: string
  cityName: string
  address: string
  phone: string
  total: number
  shippingFee: number
  totalPayable: number
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
    totalPayable: order.totalPayable,
    cityName: order.cityName,
    address: order.address,
    phone: order.phone,
  }
}

async function reserverStock(
  tx: Prisma.TransactionClient,
  lines: {
    variantId: string
    quantity: number
    productName: string
    variantName: string
    stock: number
  }[]
): Promise<void> {
  for (const line of lines) {
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
}

async function restockerArticles(
  tx: Prisma.TransactionClient,
  items: { variantId: string | null; quantity: number }[]
): Promise<void> {
  for (const item of items) {
    if (!item.variantId) continue
    await tx.productVariant.updateMany({
      where: { id: item.variantId },
      data: { stock: { increment: item.quantity } },
    })
  }
}

export async function placeOrder(
  userId: string,
  input: CheckoutInput,
  overrides?: Partial<OrderEffects>
) {
  const effects = avecSurcharges(defaultOrderEffects, overrides)
  const data = parseCheckoutInput(input)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) throw new UserNotFoundError()

  const cart = await lirePanierClient(userId)
  if (cart.lines.length === 0) throw new EmptyCartError()

  const chargé = await chargerDevis(cart)
  const projet = projeterDevis(chargé, data.cityId)
  const selection = selectionValidee(projet.selection)
  const city = selection.ville
  const montants = montantsDeLaCommande(cart.subtotal, selection)

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
    await reserverStock(tx, cart.lines)

    const created = await tx.order.create({
      data: {
        userId,
        cityName: city.name,
        address: data.address,
        phone: data.phone,
        ...montants,
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
      where: {
        userId,
        variantId: { in: cart.lines.map((line) => line.variantId) },
      },
    })
    return created
  })

  await runOrderedEffects([
    {
      message: `[order] e-mail de confirmation non envoyé pour ${order.id}`,
      fn: () =>
        effects.sendOrderPlacedEmail(toOrderEmailSnapshot(order, user.email)),
    },
    {
      message: `[order] invalidation du cache non effectuée pour ${order.id}`,
      fn: () => effects.invalidateCommande(order.id),
    },
  ])
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
    totalPayable: order.totalPayable,
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
    totalPayable: order.totalPayable,
    createdAt: order.createdAt,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
  }))
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  overrides?: Partial<OrderEffects>
) {
  const effects = avecSurcharges(defaultOrderEffects, overrides)

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true } } },
  })
  if (!existing) throw new OrderNotFoundError()
  if (!peutTransitionner(existing.status, nextStatus)) {
    throw new InvalidOrderTransitionError(existing.status, nextStatus)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })
    if (!fresh) throw new OrderNotFoundError()
    if (!peutTransitionner(fresh.status, nextStatus)) {
      throw new InvalidOrderTransitionError(fresh.status, nextStatus)
    }

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: fresh.status },
      data: { status: nextStatus },
    })
    if (claimed.count === 0) {
      throw new InvalidOrderTransitionError(fresh.status, nextStatus)
    }

    if (réapprovisionne(nextStatus)) {
      await restockerArticles(tx, fresh.items)
    }

    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    })
  })

  await runOrderedEffects([
    {
      message: `[order] e-mail de statut non envoyé pour ${orderId}`,
      fn: () =>
        effects.sendOrderStatusEmail(
          toOrderEmailSnapshot(updated, existing.user.email),
          updated.status
        ),
    },
    {
      message: `[order] invalidation du cache non effectuée pour ${orderId}`,
      fn: () => effects.invalidateCommande(orderId),
    },
  ])
  return updated
}

export async function getAdminOrder(
  orderId: string
): Promise<AdminOrderDetail> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, email: true } },
      items: true,
    },
  })
  if (!order) throw new OrderNotFoundError()

  return {
    id: order.id,
    status: order.status,
    cityName: order.cityName,
    address: order.address,
    phone: order.phone,
    total: order.total,
    shippingFee: order.shippingFee,
    totalPayable: order.totalPayable,
    createdAt: order.createdAt,
    customerName: order.user.name,
    customerEmail: order.user.email,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
    })),
  }
}

function buildOrdersWhere(
  params?: CommandeListingParams
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {}
  if (params?.statuses && params.statuses.length > 0) {
    where.status = { in: params.statuses }
  }
  if (params?.q) {
    where.user = {
      OR: [
        { name: { contains: params.q, mode: "insensitive" } },
        { email: { contains: params.q, mode: "insensitive" } },
      ],
    }
  }
  return where
}

async function runListAdminOrders(
  params?: CommandeListingParams
): Promise<AdminOrdersPage> {
  const where = buildOrdersWhere(params)
  const sens = params?.sens ?? "desc"
  const orderBy: Prisma.OrderOrderByWithRelationInput =
    params?.tri === "total" ? { totalPayable: sens } : { createdAt: sens }
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? PAGE_SIZES[0]

  const [orders, totalCount] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        user: { select: { name: true, email: true } },
        items: { select: { quantity: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return {
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      shippingFee: order.shippingFee,
      totalPayable: order.totalPayable,
      createdAt: order.createdAt,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      customerName: order.user.name,
      customerEmail: order.user.email,
    })),
    totalCount,
    pageCount: Math.ceil(totalCount / pageSize),
  }
}

export async function listAdminOrders(): Promise<AdminOrderSummary[]>
export async function listAdminOrders(
  params: CommandeListingParams
): Promise<AdminOrdersPage>
export async function listAdminOrders(
  params?: CommandeListingParams
): Promise<AdminOrdersPage | AdminOrderSummary[]> {
  const result = await runListAdminOrders(params)
  return params ? result : result.orders
}
