/**
 * Entrée serveur du Devis : `chargerDevis` retourne le Devis chargé — la
 * donnée pure d'un Panier chiffré (accès base via l'administration
 * Livraison). Construire l'interface profonde est l'affaire de
 * l'appelant : `creerDevisHolder(await chargerDevis(...))` — la fabrique
 * (`@/lib/use-cases/devis-coeur`) prend exactement le Devis chargé.
 * Réexport du cœur pur pour les appelants serveur (`panier/page.tsx`,
 * `checkout/page.tsx`, `placeOrder`).
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
 * Le Devis chargé (`DevisChargé`) est la donnée pure qui peut traverser
 * la couture serveur → client — aucune fonction, aucun getter, aucune
 * instance de classe. L'interface `DevisHolder` (getters, `choisir`,
 * `selectionValidee`) n'est pas une donnée : elle se construit derrière
 * la couture à partir de ces faits via `creerDevisHolder`, jamais
 * l'inverse.
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
import type {
  DevisChargé,
  DevisPrecedenceSources,
} from "@/lib/use-cases/devis-coeur"
import { computeCityQuotes } from "@/lib/use-cases/livraison-prix"
import {
  getFreeShippingThreshold,
  listDeliveryCities,
} from "@/lib/use-cases/livraison"

export { DeliveryCityNotFoundError } from "@/lib/use-cases/devis-coeur"

/**
 * Charge le Devis chargé — les faits purs d'un Panier chiffré.
 *
 * Récupère Villes de livraison + seuil (administration Livraison) une
 * seule fois, chiffre chaque ville via `computeCityQuotes`
 * (`panier.subtotal` + `lines.some(freeShipping)`) une seule fois, et
 * reporte les sources de précédence (`urlVilleId` gagne sur
 * `profileVilleId`).
 *
 * Strictement des données : aucune fonction, aucun getter, aucune
 * instance de classe — le Devis chargé traverse la couture serveur →
 * client. L'interface `DevisHolder` se construit derrière la couture à
 * partir de ces faits via `creerDevisHolder`.
 *
 * Ville inconnue ou absente → la sélection se résoudra « aucune » à la
 * construction ; charger ne lève jamais sur une ville inconnue ou absente.
 */
export async function chargerDevis(
  panier: DonneesPanier,
  sources?: string | null | DevisPrecedenceSources
): Promise<DevisChargé> {
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
  return {
    cities,
    threshold,
    quotes,
    sousTotal,
    ...(sources === undefined
      ? {}
      : {
          sources:
            typeof sources === "string" || sources === null
              ? { urlVilleId: sources }
              : sources,
        }),
  }
}
