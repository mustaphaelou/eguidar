/**
 * Sélection pure du Devis — module client-safe.
 *
 * Ne doit jamais importer `@/lib/db` (ni aucun module qui l'importe) :
 * consommé directement par le composant client
 * `components/storefront/checkout-form.tsx` pour la re-sélection
 * instantanée de la Ville de livraison. Un import serveur ici
 * réintroduirait `pg` (`require('dns')`) dans le bundle navigateur et
 * casserait `next build` (Turbopack). L'entrée async (`chargerDevis`,
 * accès base via l'administration Livraison) reste dans
 * `@/lib/use-cases/devis`.
 */
import {
  construireLignes,
  type RécapitulatifRow,
} from "@/lib/recapitulatif-paiement"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison-prix"

/**
 * Une Sélection du Devis répond par exactement un cas : **aucune** (rien
 * choisi, rien dû) ou **validée** (une Ville de livraison et son Devis,
 * toujours cohérents — jamais à moitié). Le cas validée porte exactement
 * deux faits : `ville` et `devis` ; l'identifiant se lit via
 * `ville.id` après rétrécissement.
 */
export type SelectionDevis =
  | { cas: "aucune" }
  | { cas: "validée"; ville: DeliveryCityOption; devis: ShippingQuote }

/**
 * Résolution pure du Devis : transforme des Villes de livraison déjà
 * récupérées plus leurs devis et un identifiant de ville demandé en une
 * Sélection du Devis.
 *
 * Identifiant connu AVEC devis existant ET ville existante → cas
 * « validée » (ville + devis). Identifiant absent / nul / inconnu, ou
 * identifiant connu sans devis ou sans ville → cas « aucune ».
 * Ne lève jamais, ne sélectionne jamais à moitié.
 * Résolution pure uniquement — indépendante du calcul des prix
 * (seuil, livraison offerte).
 */
export function selectionnerDevis(
  cities: DeliveryCityOption[],
  quotes: Record<string, ShippingQuote>,
  requestedCityId?: string | null
): SelectionDevis {
  const aucune: SelectionDevis = { cas: "aucune" }
  if (!requestedCityId) return aucune
  const devis = quotes[requestedCityId] ?? null
  if (!devis) return aucune
  const ville = cities.find((city) => city.id === requestedCityId)
  if (!ville) return aucune
  return { cas: "validée", ville, devis }
}

/**
 * Devis chargé : Villes de livraison, seuil et devis par ville, le
 * sous-total (cents) qui a chiffré les devis, la Sélection du Devis
 * absorbée à plat (un seul test du discriminant `cas` rétrécit
 * `ville` + `devis`) et lignes du Récapitulatif de paiement prêtes à
 * afficher.
 *
 * Le Devis est auto-porteur : il porte le `sousTotal` issu du Panier
 * dont il a été chargé, pour que les surfaces d'affichage ne reçoivent
 * plus le sous-total comme un fait séparé qui pourrait dériver des
 * devis. Les `rows` restent dérivées via
 * `lignesDevis(devis.sousTotal, devis)` — champ redondant voué à être
 * supprimé par le ticket de contraction.
 */
export type Devis = {
  cities: DeliveryCityOption[]
  threshold: number
  quotes: Record<string, ShippingQuote>
  sousTotal: number
  rows: RécapitulatifRow[]
} & SelectionDevis

/**
 * Lignes du Récapitulatif de paiement pour une Sélection du Devis.
 *
 * Détail interne du Devis (l'ancienne entrée Devis du Récapitulatif est
 * retirée) : cas « aucune » → « Livraison » + « À choisir » + Total omis ;
 * cas « validée » → « Livraison (Ville) » + frais + Total. La formulation
 * vit dans `construireLignes`, ici on ne fait que projeter la sélection.
 * Ne lève jamais.
 */
export function lignesDevis(
  sousTotal: number,
  selection: SelectionDevis
): RécapitulatifRow[] {
  if (selection.cas === "aucune") {
    return construireLignes({
      sousTotal,
      shipping: null,
      total: null,
    })
  }

  return construireLignes({
    sousTotal,
    shipping: {
      fee: selection.devis.shippingFee,
      city: selection.ville.name,
    },
    total: selection.devis.total,
  })
}
