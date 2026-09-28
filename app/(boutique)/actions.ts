"use server"

import { refresh } from "next/cache"

import {
  ajouterArticleAuPanier,
  modifierQuantiteArticlePanier,
  retirerArticleDuPanier,
  type ResultatPanier,
} from "@/lib/panier"

function avecRafraichissement(resultat: ResultatPanier): ResultatPanier {
  if (resultat.ok) refresh()
  return resultat
}

export async function ajouterArticleAuPanierAction(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return avecRafraichissement(await ajouterArticleAuPanier(variantId, quantity))
}

export async function modifierQuantiteArticlePanierAction(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return avecRafraichissement(
    await modifierQuantiteArticlePanier(variantId, quantity)
  )
}

export async function retirerArticleDuPanierAction(
  variantId: string
): Promise<ResultatPanier> {
  return avecRafraichissement(await retirerArticleDuPanier(variantId))
}
