import { z } from "zod"

import { enregistrerFaits } from "@/lib/automations/evenements"
import {
  COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
  type CommandeListingParams,
} from "@/lib/commande-listing"
import { prisma } from "@/lib/db"
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "@/lib/emails"
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client"
import { transitionsDisponibles } from "@/lib/statut-de-commande"
import { lirePanierClient } from "@/lib/panier"
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
  écrireLeStock,
  type EffetsStock,
  exécuterStock,
  InvalidOrderTransitionError,
  reapprovisionner,
  reserver,
  verrouillerCommande,
} from "@/lib/use-cases/commande"
import {
  avecSurcharges,
  messageDeValidation,
} from "@/lib/use-cases/mutation-squelette"
import { declarerApresEcriture } from "@/lib/apres-ecriture"
import {
  executer as executerCommande,
  type EffetsCommande,
} from "@/lib/use-cases/apres-ecriture/commande"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export type OrderEffects = EffetsCommande

type SurchargesCommande = {
  email?: Partial<OrderEffects>
  stock?: Partial<EffetsStock>
}

export {
  InvalidOrderTransitionError,
  OutOfStockError,
  type OutOfStockItem,
} from "@/lib/use-cases/commande"

export const defaultOrderEffects: OrderEffects = {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
}

export interface CheckoutInput {
  cityId: string
  address: string
  phone: string
  totalAffiche: number
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
  montantEncaisse: number
  montantRembourse: number
  montantNet: number
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
  montantEncaisse: number
  montantRembourse: number
  montantNet: number
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

export class DevisPériméError extends UserFacingError {
  constructor() {
    super(
      "Le Total à payer a changé depuis l'affichage — vérifiez le nouveau montant, puis confirmez."
    )
    this.name = "DevisPériméError"
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

const checkoutInputSchema = z.object({
  cityId: z.string().min(1, "ville de livraison requise"),
  address: deliveryAddressField,
  phone: deliveryPhoneField,
  totalAffiche: z
    .number()
    .int("total affiché en centimes entiers")
    .min(0, "total affiché invalide"),
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

type CommandeAvecArgent = {
  payments: { amount: number; refunds: { amount: number }[] }[]
}

function montantsDArgent(commande: CommandeAvecArgent): {
  montantEncaisse: number
  montantRembourse: number
  montantNet: number
} {
  const montantEncaisse = commande.payments.reduce(
    (total, paiement) => total + paiement.amount,
    0
  )
  const montantRembourse = commande.payments.reduce(
    (total, paiement) =>
      total +
      paiement.refunds.reduce(
        (rembourse, remboursement) => rembourse + remboursement.amount,
        0
      ),
    0
  )
  return {
    montantEncaisse,
    montantRembourse,
    montantNet: montantEncaisse - montantRembourse,
  }
}

const SELECT_ARGENT = {
  payments: {
    select: {
      amount: true,
      refunds: { select: { amount: true } },
    },
  },
} as const

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

async function verrouillerPanierClient(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "CartItem"
    WHERE "userId" = ${userId}
    ORDER BY "variantId" ASC
    FOR UPDATE
  `
}

export async function placeOrder(
  userId: string,
  input: CheckoutInput,
  surcharges?: SurchargesCommande
) {
  const effects = avecSurcharges(defaultOrderEffects, surcharges?.email)
  const data = parseCheckoutInput(input)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user) throw new UserNotFoundError()

  const { order, plan, ecriture } = await prisma.$transaction(async (tx) => {
    await verrouillerPanierClient(tx, userId)
    const cart = await lirePanierClient(userId, tx)
    if (cart.lines.length === 0) throw new EmptyCartError()

    const chargé = await chargerDevis(cart, undefined, tx)
    const projet = projeterDevis(chargé, data.cityId)
    const selection = selectionValidee(projet.selection)
    const city = selection.ville
    const montants = montantsDeLaCommande(cart.subtotal, selection)
    if (montants.totalPayable !== data.totalAffiche)
      throw new DevisPériméError()

    const ecriture = await écrireLeStock(
      tx,
      cart.lines.map((line) => reserver(line.variantId, line.quantity))
    )

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
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: created.id,
      snapshot: toOrderEmailSnapshot(created, user.email),
    })
    await enregistrerFaits(tx, plan.faits)
    return { order: created, plan, ecriture }
  })

  await exécuterStock(ecriture, surcharges?.stock ?? {})
  await executerCommande(plan, effects)
  return order
}

export async function getOrder(
  userId: string,
  orderId: string
): Promise<OrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { items: true, ...SELECT_ARGENT },
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
    ...montantsDArgent(order),
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
    include: { items: { select: { quantity: true } }, ...SELECT_ARGENT },
  })
  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    total: order.total,
    shippingFee: order.shippingFee,
    totalPayable: order.totalPayable,
    ...montantsDArgent(order),
    createdAt: order.createdAt,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
  }))
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  actorId: string,
  surcharges?: SurchargesCommande
) {
  const effects = avecSurcharges(defaultOrderEffects, surcharges?.email)

  const { updated, plan, ecriture } = await prisma.$transaction(async (tx) => {
    if (!(await verrouillerCommande(tx, orderId))) {
      throw new OrderNotFoundError()
    }
    const commande = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, user: { select: { email: true } } },
    })
    if (!commande) throw new OrderNotFoundError()
    if (!transitionsDisponibles(commande.status).includes(nextStatus)) {
      throw new InvalidOrderTransitionError(commande.status, nextStatus)
    }

    const changedAt = new Date()
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: commande.status },
      data:
        nextStatus === "delivered"
          ? { status: nextStatus, deliveredAt: changedAt }
          : { status: nextStatus },
    })
    if (claimed.count === 0) {
      throw new InvalidOrderTransitionError(commande.status, nextStatus)
    }

    if (nextStatus === "delivered") {
      await tx.payment.create({
        data: {
          orderId,
          amount: commande.totalPayable,
          mode: "cash_on_delivery",
          collectedAt: changedAt,
          recordedById: actorId,
        },
      })
    }

    await tx.orderStatusChange.create({
      data: {
        orderId,
        fromStatus: commande.status,
        toStatus: nextStatus,
        changedAt,
        actorId,
      },
    })

    const mouvements =
      nextStatus === "cancelled"
        ? commande.items
            .filter((item) => item.variantId)
            .map((item) => reapprovisionner(item.variantId!, item.quantity))
        : []
    const ecriture = await écrireLeStock(tx, mouvements)

    const updated = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    })
    const plan = declarerApresEcriture("commande.statut.changee", {
      commandeId: orderId,
      snapshot: toOrderEmailSnapshot(updated, commande.user.email),
      statut: nextStatus,
    })
    await enregistrerFaits(tx, plan.faits)
    return { updated, plan, ecriture }
  })

  await exécuterStock(ecriture, surcharges?.stock ?? {})
  await executerCommande(plan, effects)
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
      ...SELECT_ARGENT,
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
    ...montantsDArgent(order),
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
  const pageSize = params?.pageSize ?? COMMANDE_LISTING_PAGE_SIZE_DEFAULT

  const [orders, totalCount] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        user: { select: { name: true, email: true } },
        items: { select: { quantity: true } },
        ...SELECT_ARGENT,
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
      ...montantsDArgent(order),
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
