"use server"

import {
  ajouterArticleAuPanier,
  modifierQuantiteArticlePanier,
  retirerArticleDuPanier,
  type ProprietairePanier,
  type ResultatPanier,
} from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

async function construireProprietairePanier(): Promise<ProprietairePanier> {
  const user = await getSessionUser()
  return user ? { role: "client", compteId: user.id } : { role: "visiteur" }
}

export async function ajouterArticleAuPanierAction(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return ajouterArticleAuPanier(await construireProprietairePanier(), variantId, quantity)
}

export async function modifierQuantiteArticlePanierAction(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  return modifierQuantiteArticlePanier(
    await construireProprietairePanier(),
    articlePanierId,
    quantity
  )
}

export async function retirerArticleDuPanierAction(
  articlePanierId: string
): Promise<ResultatPanier> {
  return retirerArticleDuPanier(await construireProprietairePanier(), articlePanierId)
}
