import {
  ajouterArticleAuPanier,
  lirePanier,
  modifierQuantiteArticlePanier,
  resoudreProprietairePanier,
  retirerArticleDuPanier,
  type DonneesPanier,
  type ResultatPanier,
} from "@/lib/panier"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function lirePanierCourant(): Promise<DonneesPanier> {
  const user = await getSessionUser()
  const { lines, subtotal, itemCount } = await lirePanier(
    resoudreProprietairePanier(user)
  )
  return { lines, subtotal, itemCount }
}

export async function ajouterArticleAuPanierCourant(
  variantId: string,
  quantity: number
): Promise<ResultatPanier> {
  const user = await getSessionUser()
  return ajouterArticleAuPanier(
    resoudreProprietairePanier(user),
    variantId,
    quantity
  )
}

export async function modifierQuantiteArticlePanierCourant(
  articlePanierId: string,
  quantity: number
): Promise<ResultatPanier> {
  const user = await getSessionUser()
  return modifierQuantiteArticlePanier(
    resoudreProprietairePanier(user),
    articlePanierId,
    quantity
  )
}

export async function retirerArticleDuPanierCourant(
  articlePanierId: string
): Promise<ResultatPanier> {
  const user = await getSessionUser()
  return retirerArticleDuPanier(
    resoudreProprietairePanier(user),
    articlePanierId
  )
}
