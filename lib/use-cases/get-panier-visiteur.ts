import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  parsePanierVisiteur,
  type ArticlePanierVisiteur,
} from "@/lib/panier-visiteur"
import type { CartData, CartLine } from "@/lib/use-cases/cart"

const PANIER_VISITEUR_COOKIE = "panier-visiteur"

export async function lireArticlesPanierVisiteur(): Promise<
  ArticlePanierVisiteur[]
> {
  const jar = await cookies()
  return parsePanierVisiteur(jar.get(PANIER_VISITEUR_COOKIE)?.value)
}

export async function getPanierVisiteur(): Promise<CartData> {
  const articles = await lireArticlesPanierVisiteur()
  if (articles.length === 0) return { lines: [], subtotal: 0, itemCount: 0 }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: articles.map((article) => article.variantId) } },
    include: { product: true },
  })
  const parId = new Map(variants.map((variant) => [variant.id, variant]))

  const lines: CartLine[] = []
  for (const article of articles) {
    const variant = parId.get(article.variantId)
    if (!variant) continue

    const unitPrice = variant.product.price + variant.priceDelta
    lines.push({
      cartItemId: article.variantId,
      variantId: article.variantId,
      variantName: variant.name,
      productId: variant.productId,
      productName: variant.product.name,
      productSlug: variant.product.slug,
      image: Array.isArray(variant.product.images)
        ? (variant.product.images[0] as string | undefined) ?? null
        : null,
      unitPrice,
      quantity: article.quantity,
      lineTotal: unitPrice * article.quantity,
      stock: variant.stock,
      freeShipping: variant.product.freeShipping,
    })
  }

  return {
    lines,
    subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  }
}
