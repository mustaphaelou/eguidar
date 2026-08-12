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
