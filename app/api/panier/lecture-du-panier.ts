import { compterArticlesDuPanier, lirePanier } from "@/lib/panier"
import type { ApercuDuPanier } from "@/lib/panier-transport"
import { lireSession } from "@/lib/use-cases/session-courante"

const ENTETES_DU_PANIER = { "Cache-Control": "private, no-store" } as const

export async function repondreAuCompteurDuPanier(): Promise<Response> {
  return Response.json(
    { itemCount: await compterArticlesDuPanier() },
    { headers: ENTETES_DU_PANIER }
  )
}

export async function repondreALapercuDuPanier(): Promise<Response> {
  const [panier, client] = await Promise.all([lirePanier(), lireSession()])
  const connecte = client !== null

  // `connecte` accompagne les deux états : les entrées « Mon compte » du corps
  // choisissent Connexion ou Déconnexion sans que le document porte un Client.
  const corps: ApercuDuPanier =
    panier.lines.length === 0
      ? { etat: "vide", connecte }
      : {
          etat: "plein",
          connecte,
          lignes: panier.lines.map((article) => ({
            productSlug: article.productSlug,
            productName: article.productName,
            variantName: article.variantName,
            image: article.image,
            quantity: article.quantity,
            unitPrice: article.unitPrice,
          })),
        }

  return Response.json(corps, { headers: ENTETES_DU_PANIER })
}
