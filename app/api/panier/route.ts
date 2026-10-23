import { repondreAuCompteurDuPanier } from "./lecture-du-panier"

export async function GET(_request: Request): Promise<Response> {
  return repondreAuCompteurDuPanier()
}
