/**
 * Entrée serveur du Devis : `chargerDevis` (accès base via l'administration
 * Livraison) plus réexport du cœur pur pour les appelants serveur
 * (`panier/page.tsx`, `checkout/page.tsx`, `placeOrder`).
 *
 * Les composants clients doivent importer `@/lib/use-cases/devis-selection`
 * directement — jamais ce module, qui tire `prisma` (`pg`) via
 * `@/lib/use-cases/livraison`.
 *
 * Volontairement sans `import "server-only"` : ce garde-foo lève sous
 * vitest (condition d'export `default`) et casserait `devis.test.ts` /
 * `orders.test.ts` (précédent : `lib/panier.ts` évite l'import statique
 * de `get-session` pour la même raison). La barrière client/serveur est
 * assurée par le point d'entrée pur `devis-selection`.
 */
import type { DonneesPanier } from "@/lib/panier"
import {
  lignesDevis,
  selectionnerDevis,
  type Devis,
} from "@/lib/use-cases/devis-selection"
import { computeCityQuotes } from "@/lib/use-cases/livraison-prix"
import {
  getFreeShippingThreshold,
  listDeliveryCities,
} from "@/lib/use-cases/livraison"

export {
  estSélectionValide,
  lignesDevis,
  selectionnerDevis,
} from "@/lib/use-cases/devis-selection"
export type { Devis, SelectionDevis } from "@/lib/use-cases/devis-selection"

/**
 * Entrée async du Devis pour les surfaces d'affichage.
 *
 * Récupère Villes de livraison + seuil (administration Livraison),
 * chiffre chaque ville via `computeCityQuotes` (`panier.subtotal` +
 * `lines.some(freeShipping)`), résout la sélection via `selectionnerDevis`
 * puis construit les lignes via `lignesDevis`
 * (offerte / À choisir avec Total omis quand non sélectionné).
 *
 * Ville inconnue → trio nul + lignes À choisir, ne lève jamais.
 */
export async function chargerDevis(
  panier: DonneesPanier,
  requestedCityId?: string | null
): Promise<Devis> {
  const [cities, threshold] = await Promise.all([
    listDeliveryCities(),
    getFreeShippingThreshold(),
  ])
  const quotes = computeCityQuotes(
    cities,
    {
      subtotal: panier.subtotal,
      anyFreeShippingItem: panier.lines.some((line) => line.freeShipping),
    },
    threshold
  )
  const selection = selectionnerDevis(cities, quotes, requestedCityId)
  const rows = lignesDevis(panier.subtotal, selection)
  return {
    cities,
    threshold,
    quotes,
    ...selection,
    rows,
  }
}
