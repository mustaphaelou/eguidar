import { z } from "zod"

import { prisma } from "@/lib/db"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

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

export class CartValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "CartValidationError"
  }
}

export class CartVariantNotFoundError extends UserFacingError {
  constructor() {
    super("Variante introuvable")
    this.name = "CartVariantNotFoundError"
  }
}

export class CartItemNotFoundError extends UserFacingError {
  constructor() {
    super("Article du panier introuvable")
    this.name = "CartItemNotFoundError"
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

  const lines = items.map((item) => buildCartLine(item.variant, item.quantity, item.id))

  return { lines, ...buildCartTotals(lines) }
}

interface VarianteAvecProduit {
  id: string
  name: string
  productId: string
  priceDelta: number
  stock: number
  product: {
    price: number
    name: string
    slug: string
    images: unknown
    freeShipping: boolean
  }
}

export function buildCartLine(
  variant: VarianteAvecProduit,
  quantity: number,
  cartItemId: string = variant.id
): CartLine {
  const unitPrice = variant.product.price + variant.priceDelta
  return {
    cartItemId,
    variantId: variant.id,
    variantName: variant.name,
    productId: variant.productId,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    image: Array.isArray(variant.product.images)
      ? (variant.product.images[0] as string | undefined) ?? null
      : null,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
    stock: variant.stock,
    freeShipping: variant.product.freeShipping,
  }
}

export function buildCartTotals(
  lines: readonly CartLine[]
): Pick<CartData, "subtotal" | "itemCount"> {
  return {
    subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  }
}
