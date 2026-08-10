import { z } from "zod"

import { prisma } from "@/lib/db"

export interface CartLine {
  cartItemId: string
  variantId: string
  variantName: string
  productId: string
  productName: string
  productSlug: string
  image: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  stock: number
  freeShipping: boolean
}

export interface CartData {
  lines: CartLine[]
  subtotal: number
  itemCount: number
}

export interface ShippingQuote {
  subtotal: number
  shippingFee: number
  total: number
}

export interface DeliveryCityOption {
  id: string
  name: string
  fee: number
}

export interface ShippingFeeInput {
  subtotal: number
  cityFee: number
  freeShippingThreshold: number
  anyFreeShippingItem: boolean
}

export class CartValidationError extends Error {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "CartValidationError"
  }
}

export class CartVariantNotFoundError extends Error {
  constructor() {
    super("Variante introuvable")
    this.name = "CartVariantNotFoundError"
  }
}

export class CartItemNotFoundError extends Error {
  constructor() {
    super("Article du panier introuvable")
    this.name = "CartItemNotFoundError"
  }
}

export class DeliveryCityNotFoundError extends Error {
  constructor() {
    super("Ville de livraison introuvable")
    this.name = "DeliveryCityNotFoundError"
  }
}

const quantitySchema = z.number().int().min(1, "la quantité doit être au moins 1")

function parseQuantity(quantity: number): number {
  const result = quantitySchema.safeParse(quantity)
  if (!result.success) {
    throw new CartValidationError(result.error.issues.map((issue) => issue.message))
  }
  return result.data
}

export function computeShippingFee(input: ShippingFeeInput): number {
  if (input.subtotal >= input.freeShippingThreshold) return 0
  if (input.anyFreeShippingItem) return 0
  return input.cityFee
}

export async function computeCartShippingFee(cart: CartData, cityFee: number): Promise<number> {
  const settings = await prisma.shippingSettings.findUnique({ where: { id: "default" } })
  return computeShippingFee({
    subtotal: cart.subtotal,
    cityFee,
    freeShippingThreshold: settings?.freeShippingThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD,
    anyFreeShippingItem: cart.lines.some((line) => line.freeShipping),
  })
}

export async function addToCart(userId: string, variantId: string, quantity: number): Promise<void> {
  const qty = parseQuantity(quantity)
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } })
  if (!variant) throw new CartVariantNotFoundError()

  await prisma.cartItem.upsert({
    where: { userId_variantId: { userId, variantId } },
    update: { quantity: { increment: qty } },
    create: { userId, variantId, quantity: qty },
  })
}

export async function updateCartItemQuantity(
  userId: string,
  cartItemId: string,
  quantity: number
): Promise<void> {
  const qty = parseQuantity(quantity)
  const existing = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId } })
  if (!existing) throw new CartItemNotFoundError()

  await prisma.cartItem.update({ where: { id: cartItemId }, data: { quantity: qty } })
}

export async function removeCartItem(userId: string, cartItemId: string): Promise<void> {
  const existing = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId } })
  if (!existing) throw new CartItemNotFoundError()

  await prisma.cartItem.delete({ where: { id: cartItemId } })
}

export async function getCart(userId: string): Promise<CartData> {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { variant: { include: { product: true } } },
  })

  const lines: CartLine[] = items.map((item) => {
    const unitPrice = item.variant.product.price + item.variant.priceDelta
    return {
      cartItemId: item.id,
      variantId: item.variantId,
      variantName: item.variant.name,
      productId: item.variant.productId,
      productName: item.variant.product.name,
      productSlug: item.variant.product.slug,
      image: Array.isArray(item.variant.product.images)
        ? (item.variant.product.images[0] as string | undefined) ?? null
        : null,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
      stock: item.variant.stock,
      freeShipping: item.variant.product.freeShipping,
    }
  })

  return {
    lines,
    subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  }
}

export async function getCartShippingQuote(
  userId: string,
  cityId: string
): Promise<ShippingQuote | null> {
  const city = await prisma.deliveryCity.findUnique({ where: { id: cityId } })
  if (!city) return null

  const cart = await getCart(userId)
  const shippingFee = await computeCartShippingFee(cart, city.fee)
  return {
    subtotal: cart.subtotal,
    shippingFee,
    total: cart.subtotal + shippingFee,
  }
}

export async function getCartShippingQuotes(
  userId: string
): Promise<Record<string, ShippingQuote>> {
  const [cities, cart] = await Promise.all([listDeliveryCities(), getCart(userId)])
  const quotes: Record<string, ShippingQuote> = {}
  for (const city of cities) {
    const shippingFee = await computeCartShippingFee(cart, city.fee)
    quotes[city.id] = { subtotal: cart.subtotal, shippingFee, total: cart.subtotal + shippingFee }
  }
  return quotes
}

export const DEFAULT_FREE_SHIPPING_THRESHOLD = 100000

export async function getFreeShippingThreshold(): Promise<number> {
  const settings = await prisma.shippingSettings.findUnique({ where: { id: "default" } })
  return settings?.freeShippingThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD
}

export function listDeliveryCities(): Promise<DeliveryCityOption[]> {
  return prisma.deliveryCity.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, fee: true },
  })
}
