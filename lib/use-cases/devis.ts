/**
 * Entrée serveur du Devis : `chargerDevis` retourne le Devis chargé — la
 * donnée pure d'un Panier chiffré (accès base via l'administration
 * Livraison) — à partir de faits bruts (`{villeParam?, profileVilleId?}`,
 * voir `DevisPrecedenceFaitsBruts`). Dériver le Devis projeté est l'affaire de
 * l'appelant : `projeterDevis(await chargerDevis(panier, faits), villeId)`
 * — le projecteur prend exactement le Devis chargé et la Ville de
 * livraison choisie. Ce module réexporte le cœur pur pour les appelants
 * serveur : `projeterDevis`, `selectionValidee` et
 * `DeliveryCityNotFoundError` (`panier/page.tsx`, `placeOrder`).
 *
 * Les composants clients doivent importer `@/lib/use-cases/devis-selection`
 * directement (porte d'entrée cliente : `useDevisSelection`) — jamais ce
 * module, qui tire `prisma` (`pg`) via `@/lib/use-cases/livraison`.
 *
 * Le Devis est auto-porteur : il porte le `sousTotal` issu du Panier dont
 * il a été chargé ; les Villes de livraison, la Sélection du Devis, les
 * lignes du Récapitulatif et l'identifiant de la ville sélectionnée se
 * dérivent par la projection unique `projeterDevis` — pages serveur comme
 * hook passent par elle. Le projecteur est la surface de test du cœur :
 * les suites passent par `projeterDevis`, jamais par une couture interne
 * (`selectionnerDevis`, `lignesDevis`), devenue privée.
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
 * de `session-courante` pour la même raison). La barrière client/serveur est
 * assurée par le cœur pur `devis-coeur` (sans directive) : ce module
 * serveur et l'entrée cliente `devis-selection` (« use client », le
 * crochet seul) y puisent sans jamais se croiser — un serveur ne doit
 * jamais importer `devis-selection`, dont les fonctions exportées lèvent
 * dès qu'on les appelle depuis le serveur.
 */
import type { DonneesPanier } from "@/lib/panier"
import type { DevisChargé } from "@/lib/use-cases/devis-coeur"
import {
  computeCityQuotes,
  type DeliveryCityOption,
} from "@/lib/use-cases/livraison-prix"
import {
  getFreeShippingThreshold,
  listDeliveryCities,
} from "@/lib/use-cases/livraison"
import { resoudreVilleUrl } from "@/lib/use-cases/ville-url"

export {
  DeliveryCityNotFoundError,
  projeterDevis,
  selectionValidee,
} from "@/lib/use-cases/devis-coeur"

/**
 * Faits bruts de la Précédence du Devis, tels que `chargerDevis` les
 * reçoit : la valeur brute du `?ville=` (`villeParam`) et la Ville de
 * livraison sauvegardée du Client (`profileVilleId`). Le module résout
 * lui-même le langage d'URL (slug puis alias d'identifiant, ADR-0017) et
 * le fait de présence d'un lien, applique la Précédence (lien > profil >
 * aucune) et porte le résultat comme la Ville initiale du Devis chargé —
 * aucun appelant ne dérive `urlVilleFournie`, ne résout un slug par
 * lui-même, ni ne recalcule la Ville initiale.
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
 * (`profileVilleId`). Ce module est le seul propriétaire de la Précédence
 * (lien > profil > aucune) : il résout le langage d'URL (slug puis alias
 * d'identifiant, ADR-0017) contre les Villes déjà chargées
 * (`listDeliveryCities`), en déduit la présence d'un lien, rogne la Ville
 * du profil une seule fois — le rognage du chemin URL vit dans le module
 * d'URL, ici aucune double rognure — et porte le résultat comme
 * `villeInitiale` sur le Devis chargé. Aucune requête supplémentaire,
 * aucune double vérification d'existence.
 *
 * Récupère Villes de livraison + seuil (administration Livraison) une
 * seule fois et chiffre chaque ville via `computeCityQuotes`
 * (`panier.subtotal` + `lines.some(freeShipping)`) une seule fois.
 *
 * Strictement des données : aucune fonction, aucun getter, aucune
 * instance de classe — le Devis chargé traverse la couture serveur →
 * client. Le Devis projeté se dérive derrière la couture à partir de ces
 * faits via `projeterDevis`.
 *
 * Ville inconnue ou absente → `villeInitiale` est `null` et la Sélection
 * se résoudra « aucune » à la projection ; charger ne lève jamais sur une
 * ville inconnue ou absente. Sans faits bruts — appelant qui projette une
 * ville explicite (`placeOrder`) — `villeInitiale` est `null`.
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
    villeInitiale: resoudreVilleInitiale(cities, faits),
  }
}

/**
 * Précédence du Devis — lien > profil > aucune — résolue une seule fois,
 * au chargement.
 *
 * Un lien fourni l'emporte : `resoudreVilleUrl` répond déjà propre (slug
 * rogné avant correspondance, identifiant pris dans les Villes chargées,
 * `null` si inconnu), sans repli sur le profil même pour une ville
 * inconnue (la Sélection résoudra « aucune »). Sinon la Ville du profil,
 * rognée ici une seule fois, sert de repli si non blanche ; sinon `null`.
 * Sans faits bruts → `null`.
 */
function resoudreVilleInitiale(
  cities: DeliveryCityOption[],
  faits?: DevisPrecedenceFaitsBruts
): string | null {
  if (faits === undefined) return null
  const lien = resoudreVilleUrl(cities, faits.villeParam)
  if (lien.urlVilleFournie) return lien.urlVilleId
  return faits.profileVilleId?.trim() || null
}
