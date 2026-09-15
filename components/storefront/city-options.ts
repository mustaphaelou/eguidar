import { formatShippingFee } from "@/lib/money"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"

/**
 * Projection unique des Villes de livraison vers les items de Select des
 * trois pickers (Panier, Commander, Profil). Chaque ligne porte ses deux
 * libellés : `label` est le nom seul, rendu par le déclencheur fermé
 * (ADR-0017) ; `optionLabel` est le nom suivi des frais, rendu par l'option
 * ouverte (« Livraison offerte » quand les frais sont nuls). `value` reste
 * l'identifiant interne, la seule valeur soumise par les formulaires.
 */
export function cityOptions(cities: DeliveryCityOption[]): {
  value: string
  label: string
  optionLabel: string
}[] {
  return cities.map((city) => ({
    value: city.id,
    label: city.name,
    optionLabel: `${city.name} — ${formatShippingFee(city.fee)}`,
  }))
}
