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
export type {
  DevisChargé,
  DevisProjeté,
  ValidatedSelectionDevis,
} from "@/lib/use-cases/devis-coeur"

export interface DevisPrecedenceFaitsBruts {
  villeParam?: string | null
  profileVilleId?: string | null
}

export async function lireDevis(
  panier: DonneesPanier,
  faits: DevisPrecedenceFaitsBruts
): Promise<{ chargé: DevisChargé; projeté: DevisProjeté }> {
  const chargé = await chargerDevis(panier, faits)
  return { chargé, projeté: projeterDevis(chargé, chargé.villeInitiale) }
}

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

function resoudreVilleInitiale(
  cities: DeliveryCityOption[],
  faits?: DevisPrecedenceFaitsBruts
): string | null {
  if (faits === undefined) return null
  const lien = resoudreVilleUrl(cities, faits.villeParam)
  if (lien.urlVilleFournie) return lien.urlVilleId
  return faits.profileVilleId?.trim() || null
}
