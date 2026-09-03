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

export interface SelectionDevis {
  selectedCityId: string | null
  selectedCity: DeliveryCityOption | null
  selectedQuote: ShippingQuote | null
}

/**
 * Résolution pure du Devis : transforme des Villes de livraison déjà
 * récupérées plus leurs devis et un identifiant de ville demandé en une
 * sélection validée (identifiant, ville, devis — tous nuls par défaut).
 *
 * Identifiant connu AVEC devis existant ET ville existante → trio renseigné.
 * Identifiant absent / nul / inconnu, ou identifiant connu sans devis ou sans
 * ville → trio nul. Ne lève jamais, ne sélectionne jamais à moitié.
 * Résolution pure uniquement — indépendante du calcul des prix
 * (seuil, livraison offerte).
 */
export function selectionnerDevis(
  cities: DeliveryCityOption[],
  quotes: Record<string, ShippingQuote>,
  requestedCityId?: string | null
): SelectionDevis {
  const nullTrio: SelectionDevis = {
    selectedCityId: null,
    selectedCity: null,
    selectedQuote: null,
  }
  if (!requestedCityId) return nullTrio
  const selectedQuote = quotes[requestedCityId] ?? null
  if (!selectedQuote) return nullTrio
  const selectedCity =
    cities.find((city) => city.id === requestedCityId) ?? null
  if (!selectedCity) return nullTrio
  return {
    selectedCityId: requestedCityId,
    selectedCity,
    selectedQuote,
  }
}

/**
 * Devis chargé : Villes de livraison, seuil et devis par ville, sélection
 * validée (identifiant, ville, devis — tous nuls par défaut) et lignes du
 * Récapitulatif de paiement prêtes à afficher.
 */
export interface Devis extends SelectionDevis {
  cities: DeliveryCityOption[]
  threshold: number
  quotes: Record<string, ShippingQuote>
  rows: RécapitulatifRow[]
}

/**
 * Prédicat partagé : une sélection Devis n'est valide que lorsque la ville
 * ET le devis sont tous deux renseignés (jamais à moitié). Utilisé par
 * `lignesDevis` et `placeOrder` pour ne définir la validité qu'en un seul
 * endroit.
 */
export function estSélectionValide(
  selection: SelectionDevis
): selection is SelectionDevis & {
  selectedCity: DeliveryCityOption
  selectedQuote: ShippingQuote
} {
  return selection.selectedCity !== null && selection.selectedQuote !== null
}

/**
 * Lignes du Récapitulatif de paiement pour un Devis validé.
 *
 * Détail interne du Devis (l'ancienne entrée Devis du Récapitulatif est
 * retirée) : sans ville ni devis validés → « Livraison » + « À choisir » + Total omis ;
 * sinon « Livraison (Ville) » + frais + Total. La formulation vit dans
 * `construireLignes`, ici on ne fait que projeter la sélection validée.
 * Ne lève jamais.
 */
export function lignesDevis(
  sousTotal: number,
  selection: SelectionDevis
): RécapitulatifRow[] {
  if (!estSélectionValide(selection)) {
    return construireLignes({
      sousTotal,
      shipping: null,
      total: null,
    })
  }

  return construireLignes({
    sousTotal,
    shipping: {
      fee: selection.selectedQuote.shippingFee,
      city: selection.selectedCity.name,
    },
    total: selection.selectedQuote.total,
  })
}
