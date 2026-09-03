import type {
  DeliveryCityOption,
  ShippingQuote,
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
