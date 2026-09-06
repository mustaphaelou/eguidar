/**
 * Entrée serveur du Devis : `chargerDevis` (accès base via l'administration
 * Livraison) plus réexport du cœur pur pour les appelants serveur
 * (`panier/page.tsx`, `checkout/page.tsx`, `placeOrder`).
 *
 * Les composants clients doivent importer `@/lib/use-cases/devis-selection`
 * directement (porte d'entrée cliente : `useDevisSelection`) — jamais ce
 * module, qui tire `prisma` (`pg`) via `@/lib/use-cases/livraison`.
 *
 * Le Devis est auto-porteur : il porte le `sousTotal` issu du Panier dont
 * il a été chargé ; les lignes du Récapitulatif se dérivent toujours via
 * le projecteur unique `lignesDevis(devis.sousTotal, devis)` — pages
 * serveur comme hook partagent la même couture.
 *
 * Non-buts : pas de re-sélection synchronisée avec l'URL sur checkout
 * (état local `useDevisSelection`) ; pas d'entrée de sélection allégée à
 * côté de `chargerDevis` — `placeOrder` garde `chargerDevis` et rétrécit
 * l'union.
 *
 * Volontairement sans `import "server-only"` : ce garde-fou lève sous
 * vitest (condition d'export `default`) et casserait `devis.test.ts` /
 * `orders.test.ts` (précédent : `lib/panier.ts` évite l'import statique
 * de `get-session` pour la même raison). La barrière client/serveur est
 * assurée par le cœur pur `devis-coeur` (sans directive) : ce module
 * serveur et l'entrée cliente `devis-selection` (« use client », le
 * crochet seul) y puisent sans jamais se croiser — un serveur ne doit
 * jamais importer `devis-selection`, dont les fonctions exportées lèvent
 * dès qu'on les appelle depuis le serveur.
 */
import type { DonneesPanier } from "@/lib/panier"
import {
  creerDevisHolder,
  selectionnerDevis,
  type Devis,
  type DevisHolder,
  type DevisPrecedenceSources,
} from "@/lib/use-cases/devis-coeur"
import { computeCityQuotes } from "@/lib/use-cases/livraison-prix"
import {
  getFreeShippingThreshold,
  listDeliveryCities,
} from "@/lib/use-cases/livraison"

export {
  createDevisHolder,
  creerDevisHolder,
  DeliveryCityNotFoundError,
  lignesDevis,
  selectionnerDevis,
} from "@/lib/use-cases/devis-coeur"
export type {
  Devis,
  DevisHolder,
  DevisHolderInit,
  DevisPrecedenceSources,
  SelectionDevis,
  ValidatedSelectionDevis,
} from "@/lib/use-cases/devis-coeur"

/**
 * Entrée async du Devis pour les surfaces d'affichage.
 *
 * Récupère Villes de livraison + seuil (administration Livraison),
 * chiffre chaque ville via `computeCityQuotes` (`panier.subtotal` +
 * `lines.some(freeShipping)`), puis résout la sélection via
 * `selectionnerDevis` (offerte / À choisir avec Total omis quand non
 * sélectionné).
 *
 * Le Devis retourné est auto-porteur : il porte le `sousTotal`
 * (`panier.subtotal`) qui a chiffré ses devis. Les lignes ne sont pas
 * construites ici : elles se dérivent via le projecteur unique
 * `lignesDevis(devis.sousTotal, devis)`.
 *
 * Ville inconnue → sélection « aucune », ne lève jamais.
 */
export async function chargerDevis(
  panier: DonneesPanier,
  requestedCityId?: string | null
): Promise<Devis> {
  const sousTotal = panier.subtotal
  const [cities, threshold] = await Promise.all([
    listDeliveryCities(),
    getFreeShippingThreshold(),
  ])
  const quotes = computeCityQuotes(
    cities,
    {
      subtotal: sousTotal,
      anyFreeShippingItem: panier.lines.some((line) => line.freeShipping),
    },
    threshold
  )
  const selection = selectionnerDevis(cities, quotes, requestedCityId)
  return {
    cities,
    threshold,
    quotes,
    sousTotal,
    ...selection,
  }
}

/**
 * Charge le Devis et l'enveloppe dans l'interface profonde DevisHolder.
 */
export async function chargerDevisHolder(
  panier: DonneesPanier,
  sources?: string | null | DevisPrecedenceSources
): Promise<DevisHolder> {
  const devis = await chargerDevis(panier)
  return creerDevisHolder(devis, sources)
}
