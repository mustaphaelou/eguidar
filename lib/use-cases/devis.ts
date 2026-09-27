/**
 * Entrée serveur du Devis — la Lecture du Devis : `lireDevis` prend le
 * Panier et les faits bruts de la Précédence (`DevisPrecedenceFaitsBruts`
 * — requis, pas de mode optionnel) et répond des deux moitiés — le Devis
 * chargé et le Devis projeté — en composant `chargerDevis` puis
 * `projeterDevis(chargé, chargé.villeInitiale)`. Une page fait un seul
 * appel : ni la résolution de la Précédence ni la projection ne sont
 * l'affaire de l'appelant. L'entrée possède la projection côté page — le
 * Panier lit le projeté, checkout remonte le chargé à la couture
 * serveur → client.
 *
 * Les verbes voisins restent en place pour la prise de commande :
 * `chargerDevis` (la charge nue, que `placeOrder` compose avec la Ville
 * soumise), le projecteur `projeterDevis` à Ville explicite et le
 * rétrécissement `selectionValidee`. Ce module réexporte le cœur pur pour
 * les appelants serveur : `projeterDevis`, `selectionValidee` et
 * `DeliveryCityNotFoundError`.
 *
 * Les composants clients doivent importer `@/lib/use-cases/devis-selection`
 * directement (porte d'entrée cliente : `useDevisSelection`) — jamais ce
 * module, qui tire `prisma` (`pg`) via `@/lib/use-cases/livraison`.
 *
 * Le Devis est auto-porteur et se projette par la projection unique
 * `projeterDevis` — la Lecture du Devis y passe pour les pages, le hook
 * pour le client : les faits portés et la surface de test du cœur sont
 * détaillés au cœur pur (`devis-coeur`).
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
import {
  projeterDevis,
  type DevisChargé,
  type DevisProjeté,
} from "@/lib/use-cases/devis-coeur"
import {
  computeShippingFee,
  type DeliveryCityOption,
  type ShippingQuote,
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
export type { DevisChargé, DevisProjeté } from "@/lib/use-cases/devis-coeur"

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
 * Lecture du Devis — l'entrée de lecture d'une page : un seul appel
 * répond des deux moitiés, le Devis chargé et le Devis projeté.
 *
 * Prend le Panier et les faits bruts de la Précédence
 * (`DevisPrecedenceFaitsBruts` — requis, pas de mode optionnel), charge
 * le Devis puis projette sur sa propre Ville initiale
 * (`projeterDevis(chargé, chargé.villeInitiale)`) — exactement la
 * séquence que chaque page composait à la main. Aucune page ne dérive la
 * Précédence ni ne lance la projection : l'appelant reçoit les deux
 * moitiés et n'en consomme qu'une (le Panier lit le projeté, checkout
 * remonte le chargé à la couture serveur → client).
 */
export async function lireDevis(
  panier: DonneesPanier,
  faits: DevisPrecedenceFaitsBruts
): Promise<{ chargé: DevisChargé; projeté: DevisProjeté }> {
  const chargé = await chargerDevis(panier, faits)
  return { chargé, projeté: projeterDevis(chargé, chargé.villeInitiale) }
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
 * seule fois et chiffre chaque ville par la règle `computeShippingFee`
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
  const anyFreeShippingItem = panier.lines.some((line) => line.freeShipping)
  const quotes: Record<string, ShippingQuote> = {}
  for (const city of cities) {
    const shippingFee = computeShippingFee({
      subtotal: sousTotal,
      cityFee: city.fee,
      freeShippingThreshold: threshold,
      anyFreeShippingItem,
    })
    quotes[city.id] = {
      subtotal: sousTotal,
      shippingFee,
      total: sousTotal + shippingFee,
    }
  }
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
