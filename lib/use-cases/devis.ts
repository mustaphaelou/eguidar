/**
 * Entrée serveur du Devis : `chargerDevis` retourne le Devis chargé — la
 * donnée pure d'un Panier chiffré (accès base via l'administration
 * Livraison) — à partir de faits bruts (`{villeParam?, profileVilleId?}`,
 * voir `DevisPrecedenceFaitsBruts`). Dériver le Devis projeté est l'affaire de
 * l'appelant : `projeterDevis(await chargerDevis(panier, faits), villeId)`
 * — le projecteur (`@/lib/use-cases/devis-coeur`) prend exactement le
 * Devis chargé et la Ville de livraison choisie.
 * Réexport du cœur pur pour les appelants serveur (`panier/page.tsx`,
 * `checkout/page.tsx`, `placeOrder`).
 *
 * Les composants clients doivent importer `@/lib/use-cases/devis-selection`
 * directement (porte d'entrée cliente : `useDevisSelection`) — jamais ce
 * module, qui tire `prisma` (`pg`) via `@/lib/use-cases/livraison`.
 *
 * Le Devis est auto-porteur : il porte le `sousTotal` issu du Panier dont
 * il a été chargé ; les Villes de livraison, la Sélection du Devis, les
 * lignes du Récapitulatif et l'identifiant de la ville sélectionnée se
 * dérivent par la projection unique `projeterDevis`, qui compose
 * `lignesDevis` — pages serveur comme hook passent par elle. Les coutures
 * internes gardent leurs tests directs.
 *
 * Le Devis chargé (`DevisChargé`) est la donnée pure qui peut traverser
 * la couture serveur → client — aucune fonction, aucun getter, aucune
 * instance de classe. Le Devis projeté se dérive derrière la couture à
 * partir de ces faits via `projeterDevis`, jamais l'inverse.
 *
 * Non-buts : pas de re-sélection synchronisée avec l'URL sur checkout
 * (état local `useDevisSelection`) ; pas d'entrée de sélection allégée à
 * côté de `chargerDevis` — `placeOrder` garde `chargerDevis` et rétrécit
 * la Sélection par `selectionValidee`.
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
import type { DevisChargé } from "@/lib/use-cases/devis-coeur"
import { resoudreVilleUrl } from "@/lib/use-cases/devis-coeur"
import { computeCityQuotes } from "@/lib/use-cases/livraison-prix"
import {
  getFreeShippingThreshold,
  listDeliveryCities,
} from "@/lib/use-cases/livraison"

export { DeliveryCityNotFoundError } from "@/lib/use-cases/devis-coeur"

/**
 * Faits bruts de la Précédence du Devis, tels que `chargerDevis` les
 * reçoit : la valeur brute du `?ville=` (`villeParam`) et la Ville de
 * livraison sauvegardée du Client (`profileVilleId`). Le module résout
 * lui-même le langage d'URL (slug puis alias d'identifiant, ADR-0017) et
 * le fait de présence d'un lien — aucun appelant ne dérive
 * `urlVilleFournie` ni ne résout un slug par lui-même.
 */
export interface DevisPrecedenceFaitsBruts {
  villeParam?: string | null
  profileVilleId?: string | null
}

/**
 * Charge le Devis chargé — les faits purs d'un Panier chiffré.
 *
 * Prend les faits bruts de la Précédence du Devis : la valeur brute du
 * `?ville=` (`villeParam`) et la Ville de livraison sauvegardée du Client
 * (`profileVilleId`). Le langage d'URL (slug puis alias d'identifiant,
 * ADR-0017) et le fait de présence `urlVilleFournie` se résolvent ici,
 * contre les Villes déjà chargées (`listDeliveryCities`) — aucune requête
 * supplémentaire, aucune double vérification d'existence.
 *
 * Récupère Villes de livraison + seuil (administration Livraison) une
 * seule fois, chiffre chaque ville via `computeCityQuotes`
 * (`panier.subtotal` + `lines.some(freeShipping)`) une seule fois, et
 * construit les sources de précédence (`urlVilleId` résolue gagne sur
 * `profileVilleId`) au titre du module seul.
 *
 * Strictement des données : aucune fonction, aucun getter, aucune
 * instance de classe — le Devis chargé traverse la couture serveur →
 * client. Le Devis projeté se dérive derrière la couture à partir de ces
 * faits via `projeterDevis`.
 *
 * Ville inconnue ou absente → la sélection se résoudra « aucune » à la
 * construction ; charger ne lève jamais sur une ville inconnue ou absente.
 * Sans faits bruts — appelant qui projette une ville explicite
 * (`placeOrder`) — `sources` est omise.
 */
export async function chargerDevis(
  panier: DonneesPanier,
  faits?: DevisPrecedenceFaitsBruts
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
    ...(faits === undefined
      ? {}
      : {
          sources: {
            ...resoudreVilleUrl(cities, faits.villeParam),
            profileVilleId: faits.profileVilleId ?? null,
          },
        }),
  }
}
