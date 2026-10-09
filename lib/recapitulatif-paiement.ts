import { formatPrice, formatShippingFee } from "@/lib/money"

export type RécapitulatifRowKind = "detail" | "total"
export type RécapitulatifRowTone = "offered" | "muted"

export interface RécapitulatifRow {
  label: string
  value: string
  kind: RécapitulatifRowKind
  tone?: RécapitulatifRowTone
}

export interface CommandePourRécapitulatif {
  total: number
  shippingFee: number
  totalPayable: number
  cityName?: string | null
}

type FaitsRécapitulatif = {
  sousTotal: number
  shipping: { fee: number; city?: string } | null
  total: number | null
}

export function construireLignes(
  faits: FaitsRécapitulatif
): RécapitulatifRow[] {
  const rows: RécapitulatifRow[] = [
    {
      label: "Sous-total (TVA incluse)",
      value: formatPrice(faits.sousTotal),
      kind: "detail",
    },
  ]

  const shippingLabel = faits.shipping?.city
    ? `Livraison (${faits.shipping.city})`
    : "Livraison"

  if (faits.shipping === null) {
    rows.push({
      label: shippingLabel,
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
  } else if (faits.shipping.fee === 0) {
    rows.push({
      label: shippingLabel,
      value: formatShippingFee(0),
      kind: "detail",
      tone: "offered",
    })
  } else {
    rows.push({
      label: shippingLabel,
      value: formatPrice(faits.shipping.fee),
      kind: "detail",
    })
  }

  if (faits.total !== null) {
    rows.push({
      label: "Total à payer à la livraison",
      value: formatPrice(faits.total),
      kind: "total",
    })
  }

  return rows
}

export function récapitulatifRowsFromCommande(
  commande: CommandePourRécapitulatif
): RécapitulatifRow[] {
  return construireLignes({
    sousTotal: commande.total,
    shipping: {
      fee: commande.shippingFee,
      city: commande.cityName ?? undefined,
    },
    total: commande.totalPayable,
  })
}
