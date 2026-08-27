import { cookies } from "next/headers"
import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  addToPanierVisiteur,
  parsePanierVisiteur,
  quantiteValide,
  serializePanierVisiteur,
  type ArticlePanierVisiteur,
} from "@/lib/panier-visiteur"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

export type ProprietairePanier =
  | { role: "visiteur" }
  | { role: "client"; compteId: string }

export type Panier = CartData & { proprietaire: ProprietairePanier }

export type MotifRefusPanier =
  | "cap-atteinte"
  | "quantite-invalide"
  | "variante-inconnue"
  | "article-inconnu"

export type ResultatPanier =
  | { ok: true }
  | { ok: false; motif: MotifRefusPanier }

export interface CartLine {
  articlePanierId: string
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

export async function lirePanier(proprietaire: ProprietairePanier): Promise<Panier> {
  if (proprietaire.role === "client") {
    return { proprietaire, ...(await getCart(proprietaire.compteId)) }
  }

  const articles = await lireArticlesPanierVisiteur()
  if (articles.length === 0) {
    return { proprietaire, lines: [], subtotal: 0, itemCount: 0 }
  }

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

  return { proprietaire, lines, ...buildCartTotals(lines) }
}

export async function addToCart(
  userId: string,
  variantId: string,
  quantity: number
): Promise<void> {
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
  articlePanierId: string,
  quantity: number
): Promise<void> {
  const qty = parseQuantity(quantity)
  const existing = await prisma.cartItem.findFirst({ where: { id: articlePanierId, userId } })
  if (!existing) throw new CartItemNotFoundError()

  await prisma.cartItem.update({ where: { id: articlePanierId }, data: { quantity: qty } })
}

export async function removeCartItem(userId: string, articlePanierId: string): Promise<void> {
  const existing = await prisma.cartItem.findFirst({ where: { id: articlePanierId, userId } })
  if (!existing) throw new CartItemNotFoundError()

  await prisma.cartItem.delete({ where: { id: articlePanierId } })
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
  articlePanierId: string = variant.id
): CartLine {
  const unitPrice = variant.product.price + variant.priceDelta
  return {
    articlePanierId,
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
