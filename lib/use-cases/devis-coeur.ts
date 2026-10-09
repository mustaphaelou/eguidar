import {
  construireLignes,
  type RécapitulatifRow,
} from "@/lib/recapitulatif-paiement"
import {
  DeliveryCityNotFoundError,
  type DeliveryCityOption,
  type ShippingQuote,
} from "@/lib/use-cases/livraison-prix"

export { DeliveryCityNotFoundError }

export type SelectionDevis =
  | { cas: "aucune" }
  | { cas: "validée"; ville: DeliveryCityOption; devis: ShippingQuote }

function selectionnerDevis(
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

export type DevisChargé = {
  cities: DeliveryCityOption[]
  threshold: number
  quotes: Record<string, ShippingQuote>
  sousTotal: number
  villeInitiale: string | null
}

function lignesDevis(
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

export type ValidatedSelectionDevis = Extract<
  SelectionDevis,
  { cas: "validée" }
>

export function selectionValidee(
  selection: SelectionDevis
): ValidatedSelectionDevis {
  if (selection.cas !== "validée") {
    throw new DeliveryCityNotFoundError()
  }
  return selection
}

export type DevisProjeté = {
  villes: DeliveryCityOption[]
  selection: SelectionDevis
  rows: RécapitulatifRow[]
  villeId: string | null
}

export function projeterDevis(
  devisChargé: DevisChargé,
  villeId: string | null
): DevisProjeté {
  const selection = selectionnerDevis(
    devisChargé.cities,
    devisChargé.quotes,
    villeId?.trim() || null
  )
  const rows = lignesDevis(devisChargé.sousTotal, selection)

  return {
    villes: devisChargé.cities,
    selection,
    rows,
    villeId: selection.cas === "validée" ? selection.ville.id : null,
  }
}
