"use server"

import {
  ajouterArticleAuPanier,
  modifierQuantiteArticlePanier,
  resoudreProprietairePanier,
  retirerArticleDuPanier,
  type ResultatPanier,
} from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function ajouterArticleAuPanierAction(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return ajouterArticleAuPanier(
    resoudreProprietairePanier(await getSessionUser()),
    variantId,
    quantity
  )
}

export async function modifierQuantiteArticlePanierAction(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  return modifierQuantiteArticlePanier(
    resoudreProprietairePanier(await getSessionUser()),
    articlePanierId,
    quantity
  )
}

export async function retirerArticleDuPanierAction(
  articlePanierId: string
): Promise<ResultatPanier> {
  return retirerArticleDuPanier(
    resoudreProprietairePanier(await getSessionUser()),
    articlePanierId
  )
}
