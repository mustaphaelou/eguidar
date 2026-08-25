import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  parsePanierVisiteur,
  type ArticlePanierVisiteur,
} from "@/lib/panier-visiteur"
import {
  buildCartLine,
  buildCartTotals,
  type CartData,
  type CartLine,
} from "@/lib/use-cases/cart"

export async function lireArticlesPanierVisiteur(): Promise<
  ArticlePanierVisiteur[]
> {
  const jar = await cookies()
  return parsePanierVisiteur(jar.get(NOM_COOKIE_PANIER_VISITEUR)?.value)
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
    lines.push(buildCartLine(variant, article.quantity))
  }

  return { lines, ...buildCartTotals(lines) }
}
