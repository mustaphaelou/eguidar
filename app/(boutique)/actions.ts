"use server"

import { type ResultatPanier } from "@/lib/panier"
import {
  ajouterArticleAuPanierCourant,
  modifierQuantiteArticlePanierCourant,
  retirerArticleDuPanierCourant,
} from "@/lib/use-cases/panier-courant"

export async function ajouterArticleAuPanierAction(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return ajouterArticleAuPanierCourant(variantId, quantity)
}

export async function modifierQuantiteArticlePanierAction(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  return modifierQuantiteArticlePanierCourant(articlePanierId, quantity)
}

export async function retirerArticleDuPanierAction(
  articlePanierId: string
): Promise<ResultatPanier> {
  return retirerArticleDuPanierCourant(articlePanierId)
}
