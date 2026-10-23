import { compterArticlesDuPanier, lirePanier } from "@/lib/panier"
import { lireSession } from "@/lib/use-cases/session-courante"

const ENTETES_DU_PANIER = { "Cache-Control": "private, no-store" } as const

export interface LigneDeLApercuDuPanier {
  productSlug: string
  productName: string
  variantName: string
  image: string | null
  quantity: number
  unitPrice: number
}

export type ApercuDuPanier =
  | { etat: "vide"; connecte: boolean }
  | { etat: "plein"; lignes: LigneDeLApercuDuPanier[] }

export async function repondreAuCompteurDuPanier(): Promise<Response> {
  return Response.json(
    { itemCount: await compterArticlesDuPanier() },
    { headers: ENTETES_DU_PANIER }
  )
}

export async function repondreALapercuDuPanier(): Promise<Response> {
  const [panier, client] = await Promise.all([lirePanier(), lireSession()])

  const corps: ApercuDuPanier =
    panier.lines.length === 0
      ? { etat: "vide", connecte: client !== null }
      : {
          etat: "plein",
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
