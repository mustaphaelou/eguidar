import { z } from "zod"

import { enregistrerFaits } from "@/lib/automations/evenements"
import type { CommandeListingParams } from "@/lib/commande-listing"
import { prisma } from "@/lib/db"
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "@/lib/emails"
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client"
import { peutTransitionner, réapprovisionne } from "@/lib/statut-de-commande"
import { PAGE_SIZES } from "@/lib/table-config"
import { lirePanierClient } from "@/lib/panier"
import {
  invalidateCommande,
  invalidateProduits,
} from "@/lib/use-cases/cache-invalidation"
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
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import {
  avecSurcharges,
  messageDeValidation,
} from "@/lib/use-cases/mutation-squelette"
import { declarerApresEcriture, type ProduitTouche } from "@/lib/apres-ecriture"
import {
  executer as executerCommande,
  type EffetsCommande,
} from "@/lib/use-cases/apres-ecriture/commande"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

/**
 * Les ports de la Commande sont ceux que l'adaptateur projette ; le type vit
 * dans l'adaptateur pour que le site d'appel n'en redéclare pas une copie.
 */
export type OrderEffects = EffetsCommande

const defaultOrderEffects: OrderEffects = {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  invalidateCommande,
  invalidateProduits,
}

export interface CheckoutInput {
  cityId: string
  address: string
  phone: string
  /** Total à payer lu par le Client, en centimes — comparé au Devis à la naissance de la Commande (#659). */
  totalAffiche: number
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

async function réapprovisionnerArticles(
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

/** Les faits que la transaction possède d'un Produit touché, sans sa chaîne. */
/**
 * Les Produits dont une Variante vient de bouger, lus dans la transaction de la
 * Commande. La transaction ne capture que ce qu'elle possède — l'identité du
 * Produit et la Structure à laquelle il appartenait — et ne lit jamais la
 * Structure elle-même : ADR-0030 l'interdit dans une transaction.
 */
async function produitsTouches(
  tx: Prisma.TransactionClient,
  items: readonly { variantId: string | null }[]
): Promise<ProduitTouche[]> {
  const variantes = [
    ...new Set(
      items
        .map((item) => item.variantId)
        .filter((variantId): variantId is string => variantId !== null)
    ),
  ]
  if (variantes.length === 0) return []

  return tx.product.findMany({
    where: { variants: { some: { id: { in: variantes } } } },
    select: { id: true, slug: true, categoryId: true },
    orderBy: { id: "asc" },
  })
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

  const { order, plan } = await prisma.$transaction(async (tx) => {
    const cart = await lirePanierClient(userId, tx)
    if (cart.lines.length === 0) throw new EmptyCartError()

    const chargé = await chargerDevis(cart, undefined, tx)
    const projet = projeterDevis(chargé, data.cityId)
    const selection = selectionValidee(projet.selection)
    const city = selection.ville
    const montants = montantsDeLaCommande(cart.subtotal, selection)
    // Le Devis périmé gagne sur le scan de stock : aucun fait n'est encore engagé.
    if (montants.totalPayable !== data.totalAffiche)
      throw new DevisPériméError()

    const outOfStock = cart.lines
      .filter((line) => line.quantity > line.stock)
      .map((line) => ({
        productName: line.productName,
        variantName: line.variantName,
        requested: line.quantity,
        available: line.stock,
      }))
    if (outOfStock.length > 0) throw new OutOfStockError(outOfStock)

    await reserverStock(tx, cart.lines)
    const produitsDrainés = await produitsTouches(tx, cart.lines)

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
      produitsDrainés,
    })
    await enregistrerFaits(tx, plan.faits)
    return { order: created, plan }
  })

  await executerCommande(plan, effects, { structure: lireStructure })
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

  const { updated, plan } = await prisma.$transaction(async (tx) => {
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

    let produitsRéapprovisionnés: ProduitTouche[] | null = null
    if (réapprovisionne(nextStatus)) {
      await réapprovisionnerArticles(tx, fresh.items)
      produitsRéapprovisionnés = await produitsTouches(tx, fresh.items)
    }

    const updated = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    })
    const plan = declarerApresEcriture("commande.statut.changee", {
      commandeId: orderId,
      snapshot: toOrderEmailSnapshot(updated, existing.user.email),
      statut: nextStatus,
      produitsRéapprovisionnés: produitsRéapprovisionnés ?? [],
    })
    await enregistrerFaits(tx, plan.faits)
    return { updated, plan }
  })

  await executerCommande(plan, effects, { structure: lireStructure })
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
