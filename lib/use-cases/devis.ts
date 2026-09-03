import type { DonneesPanier } from "@/lib/panier"
import {
  construireLignes,
  type RécapitulatifRow,
} from "@/lib/recapitulatif-paiement"
import {
  computeCityQuotes,
  getFreeShippingThreshold,
  listDeliveryCities,
  type DeliveryCityOption,
  type ShippingQuote,
} from "@/lib/use-cases/livraison"

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
