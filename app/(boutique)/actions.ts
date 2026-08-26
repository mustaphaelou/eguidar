"use server"

import { prisma } from "@/lib/db"
import { addToPanierVisiteur, quantiteValide } from "@/lib/panier-visiteur"
import {
  ecrirePanierVisiteur,
  lireArticlesPanierVisiteur,
} from "@/lib/panier"
import {
  addToCart,
  CartItemNotFoundError,
  CartValidationError,
  CartVariantNotFoundError,
  removeCartItem,
  updateCartItemQuantity,
} from "@/lib/use-cases/cart"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function addToCartAction(
  variantId: string,
  quantity: number
): Promise<boolean | "cap-atteinte"> {
  const user = await getSessionUser()
  if (!user) {
    const panier = await lireArticlesPanierVisiteur()
    const resultat = addToPanierVisiteur(panier, variantId, quantity)
    if (!resultat.ok) {
      return resultat.motif === "cap-atteinte" ? "cap-atteinte" : false
    }
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
    const panier = await lireArticlesPanierVisiteur()
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
    const panier = await lireArticlesPanierVisiteur()
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
