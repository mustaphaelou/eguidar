import type { DeliveryCityOption } from "@/lib/use-cases/livraison"

/**
 * Projection unique des Villes de livraison vers les items de Select des
 * trois pickers (Panier, Commander, Profil) : la valeur est l'identifiant
 * interne, le libellé le nom. Le déclencheur affiche le nom ; les options
 * gardent leur frais, formatés par l'appelant.
 */
export function cityOptions(
  cities: DeliveryCityOption[]
): { value: string; label: string }[] {
  return cities.map((city) => ({ value: city.id, label: city.name }))
}
