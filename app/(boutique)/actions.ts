"use server"

import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import {
  addToPanierVisiteur,
  parsePanierVisiteur,
  serializePanierVisiteur,
  type ArticlePanierVisiteur,
} from "@/lib/panier-visiteur"
import {
  addToCart,
  CartItemNotFoundError,
  CartValidationError,
  CartVariantNotFoundError,
  removeCartItem,
  updateCartItemQuantity,
} from "@/lib/use-cases/cart"
import { getSessionUser } from "@/lib/use-cases/get-session"

const PANIER_VISITEUR_COOKIE = "panier-visiteur"
const PANIER_VISITEUR_MAX_AGE = 60 * 60 * 24 * 30

function quantiteValide(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1
}

async function lirePanierVisiteur(): Promise<ArticlePanierVisiteur[]> {
  const jar = await cookies()
  return parsePanierVisiteur(jar.get(PANIER_VISITEUR_COOKIE)?.value)
}

async function ecrirePanierVisiteur(
  articles: readonly ArticlePanierVisiteur[]
): Promise<void> {
  const jar = await cookies()
  jar.set(PANIER_VISITEUR_COOKIE, serializePanierVisiteur(articles), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PANIER_VISITEUR_MAX_AGE,
  })
}

export async function addToCartAction(
  variantId: string,
  quantity: number,
  _nextPath: string
): Promise<boolean> {
  const user = await getSessionUser()
  if (!user) {
    const panier = await lirePanierVisiteur()
    const resultat = addToPanierVisiteur(panier, variantId, quantity)
    if (!resultat.ok) return false
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
    })
    if (!variant) return false
    await ecrirePanierVisiteur(resultat.articles)
    return true
  }
  try {
    await addToCart(user.id, variantId, quantity)
  } catch (error) {
    if (error instanceof CartValidationError || error instanceof CartVariantNotFoundError) {
      return false
    }
    throw error
  }
  return true
}

export async function updateCartItemQuantityAction(
  cartItemId: string,
  quantity: number
): Promise<void> {
  const user = await getSessionUser()
  if (!user) {
    if (!quantiteValide(quantity)) return
    const panier = await lirePanierVisiteur()
    if (!panier.some((article) => article.variantId === cartItemId)) return
    const variant = await prisma.productVariant.findUnique({
      where: { id: cartItemId },
    })
    if (!variant) return
    await ecrirePanierVisiteur(
      panier.map((article) =>
        article.variantId === cartItemId ? { ...article, quantity } : article
      )
    )
    return
  }
  try {
    await updateCartItemQuantity(user.id, cartItemId, quantity)
  } catch (error) {
    if (error instanceof CartValidationError || error instanceof CartItemNotFoundError) return
    throw error
  }
}

export async function removeCartItemAction(cartItemId: string): Promise<void> {
  const user = await getSessionUser()
  if (!user) {
    const panier = await lirePanierVisiteur()
    const restants = panier.filter((article) => article.variantId !== cartItemId)
    if (restants.length === panier.length) return
    await ecrirePanierVisiteur(restants)
    return
  }
  try {
    await removeCartItem(user.id, cartItemId)
  } catch (error) {
    if (error instanceof CartItemNotFoundError) return
    throw error
  }
}
