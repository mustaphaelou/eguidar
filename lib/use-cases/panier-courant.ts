import { refresh } from "next/cache"

import {
  ajouterArticleAuPanier,
  compterArticlesDuPanier,
  lirePanier,
  modifierQuantiteArticlePanier,
  resoudreProprietairePanier,
  retirerArticleDuPanier,
  type DonneesPanier,
  type ProprietairePanier,
  type ResultatPanier,
} from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

async function resoudreProprietaireCourant(): Promise<ProprietairePanier> {
  return resoudreProprietairePanier(await getSessionUser())
}

function avecRevalidation(resultat: ResultatPanier): ResultatPanier {
  if (resultat.ok) refresh()
  return resultat
}

export async function lirePanierCourant(): Promise<DonneesPanier> {
  return lirePanier(await resoudreProprietaireCourant())
}

export async function compterArticlesDuPanierCourant(): Promise<number> {
  return compterArticlesDuPanier(await resoudreProprietaireCourant())
}

export async function ajouterArticleAuPanierCourant(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  return avecRevalidation(
    await ajouterArticleAuPanier(
      await resoudreProprietaireCourant(),
      variantId,
      quantity
    )
  )
}

export async function modifierQuantiteArticlePanierCourant(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  return avecRevalidation(
    await modifierQuantiteArticlePanier(
      await resoudreProprietaireCourant(),
      articlePanierId,
      quantity
    )
  )
}

export async function retirerArticleDuPanierCourant(
  articlePanierId: string
): Promise<ResultatPanier> {
  return avecRevalidation(
    await retirerArticleDuPanier(
      await resoudreProprietaireCourant(),
      articlePanierId
    )
  )
}
