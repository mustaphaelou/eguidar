import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  addToPanierVisiteur,
  parsePanierVisiteur,
  quantiteValide,
  serializePanierVisiteur,
  type ArticlePanierVisiteur,
} from "@/lib/panier-visiteur"
import {
  addToCart,
  buildCartLine,
  buildCartTotals,
  CartItemNotFoundError,
  CartValidationError,
  CartVariantNotFoundError,
  removeCartItem,
  updateCartItemQuantity,
  type CartData,
  type CartLine,
} from "@/lib/use-cases/cart"

export { getCart } from "@/lib/use-cases/cart"

const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

export type ProprietairePanier =
  | { role: "visiteur" }
  | { role: "client"; compteId: string }

export type MotifRefusPanier =
  | "cap-atteinte"
  | "quantite-invalide"
  | "variante-inconnue"
  | "article-inconnu"

export type ResultatPanier =
  | { ok: true }
  | { ok: false; motif: MotifRefusPanier }

async function lireArticlesPanierVisiteur(): Promise<ArticlePanierVisiteur[]> {
  const jar = await cookies()
  return parsePanierVisiteur(jar.get(NOM_COOKIE_PANIER_VISITEUR)?.value)
}

async function ecrirePanierVisiteur(
  articles: readonly ArticlePanierVisiteur[]
): Promise<void> {
  const jar = await cookies()
  jar.set(NOM_COOKIE_PANIER_VISITEUR, serializePanierVisiteur(articles), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PANIER_VISITEUR_MAX_AGE,
  })
}

async function possedeCookiePanierVisiteur(): Promise<boolean> {
  const jar = await cookies()
  return jar.get(NOM_COOKIE_PANIER_VISITEUR) !== undefined
}

async function supprimerCookiePanierVisiteur(): Promise<void> {
  const jar = await cookies()
  jar.delete(NOM_COOKIE_PANIER_VISITEUR)
}

export async function possedePanierVisiteur(): Promise<boolean> {
  return possedeCookiePanierVisiteur()
}

export async function ajouterArticleAuPanier(
  proprietaire: ProprietairePanier,
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  if (proprietaire.role === "client") {
    try {
      await addToCart(proprietaire.compteId, variantId, quantity)
      return { ok: true }
    } catch (error) {
      if (error instanceof CartValidationError) {
        return { ok: false, motif: "quantite-invalide" }
      }
      if (error instanceof CartVariantNotFoundError) {
        return { ok: false, motif: "variante-inconnue" }
      }
      throw error
    }
  }

  const articles = await lireArticlesPanierVisiteur()
  const resultat = addToPanierVisiteur(articles, variantId, quantity)
  if (!resultat.ok) return { ok: false, motif: resultat.motif }

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
  })
  if (!variant) return { ok: false, motif: "variante-inconnue" }

  await ecrirePanierVisiteur(resultat.articles)
  return { ok: true }
}

export async function modifierQuantiteArticlePanier(
  proprietaire: ProprietairePanier,
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  if (proprietaire.role === "client") {
    try {
      await updateCartItemQuantity(proprietaire.compteId, articlePanierId, quantity)
      return { ok: true }
    } catch (error) {
      if (error instanceof CartValidationError) {
        return { ok: false, motif: "quantite-invalide" }
      }
      if (error instanceof CartItemNotFoundError) {
        return { ok: false, motif: "article-inconnu" }
      }
      throw error
    }
  }

  if (!quantiteValide(quantity)) return { ok: false, motif: "quantite-invalide" }

  const articles = await lireArticlesPanierVisiteur()
  if (!articles.some((article) => article.variantId === articlePanierId)) {
    return { ok: false, motif: "article-inconnu" }
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: articlePanierId },
  })
  if (!variant) return { ok: false, motif: "variante-inconnue" }

  await ecrirePanierVisiteur(
    articles.map((article) =>
      article.variantId === articlePanierId ? { ...article, quantity } : article
    )
  )
  return { ok: true }
}

export async function retirerArticleDuPanier(
  proprietaire: ProprietairePanier,
  articlePanierId: string
): Promise<ResultatPanier> {
  if (proprietaire.role === "client") {
    try {
      await removeCartItem(proprietaire.compteId, articlePanierId)
      return { ok: true }
    } catch (error) {
      if (error instanceof CartItemNotFoundError) {
        return { ok: false, motif: "article-inconnu" }
      }
      throw error
    }
  }

  const articles = await lireArticlesPanierVisiteur()
  const restants = articles.filter((article) => article.variantId !== articlePanierId)
  if (restants.length === articles.length) {
    return { ok: false, motif: "article-inconnu" }
  }

  await ecrirePanierVisiteur(restants)
  return { ok: true }
}

export async function rejouerPanierVisiteur(
  proprietaire: ProprietairePanier
): Promise<void> {
  if (proprietaire.role !== "client") return
  if (!(await possedeCookiePanierVisiteur())) return

  for (const article of await lireArticlesPanierVisiteur()) {
    try {
      await ajouterArticleAuPanier(proprietaire, article.variantId, article.quantity)
    } catch {
      // Article mort : le rejou est best-effort, il ne doit jamais bloquer.
    }
  }

  await supprimerCookiePanierVisiteur()
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
