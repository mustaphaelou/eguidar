import { cookies } from "next/headers"

import {
  ajouterArticleAuPanier,
  lirePanier,
  modifierQuantiteArticlePanier,
  resoudreProprietairePanier,
  retirerArticleDuPanier,
  type DonneesPanier,
  type ResultatPanier,
} from "@/lib/panier"
import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  parsePanierVisiteur,
} from "@/lib/panier-visiteur"
import { getSessionUser } from "@/lib/use-cases/get-session"

export async function lirePanierCourant(): Promise<DonneesPanier> {
  const user = await getSessionUser()
  return lirePanier(resoudreProprietairePanier(user))
}

export async function compterArticlesDuPanierCourant(): Promise<number> {
  const user = await getSessionUser()

  if (user) {
    const aggregate = await prisma.cartItem.aggregate({
      where: { userId: user.id },
      _sum: { quantity: true },
    })
    return aggregate._sum.quantity ?? 0
  }

  const articles = parsePanierVisiteur(
    (await cookies()).get(NOM_COOKIE_PANIER_VISITEUR)?.value
  )
  if (articles.length === 0) return 0

  const variantsSurvivants = await prisma.productVariant.findMany({
    where: { id: { in: articles.map((article) => article.variantId) } },
    select: { id: true },
  })
  const survivants = new Set(variantsSurvivants.map((v) => v.id))

  return articles.reduce(
    (somme, article) =>
      survivants.has(article.variantId) ? somme + article.quantity : somme,
    0
  )
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
