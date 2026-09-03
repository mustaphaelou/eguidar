"use server"

import { refresh } from "next/cache"

import {
  ajouterArticleAuPanierCourant,
  modifierQuantiteArticlePanierCourant,
  retirerArticleDuPanierCourant,
  type ResultatPanier,
} from "@/lib/panier"

export async function ajouterArticleAuPanierAction(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  const resultat = await ajouterArticleAuPanierCourant(variantId, quantity)
  if (resultat.ok) refresh()
  return resultat
}

export async function modifierQuantiteArticlePanierAction(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  const resultat = await modifierQuantiteArticlePanierCourant(
    articlePanierId,
    quantity
  )
  if (resultat.ok) refresh()
  return resultat
}

export async function retirerArticleDuPanierAction(
  articlePanierId: string
): Promise<ResultatPanier> {
  const resultat = await retirerArticleDuPanierCourant(articlePanierId)
  if (resultat.ok) refresh()
  return resultat
}
