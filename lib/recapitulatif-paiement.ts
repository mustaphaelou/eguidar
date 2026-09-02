import { formatPrice, formatShippingFee } from "@/lib/money"

export type RécapitulatifRowKind = "detail" | "total"
export type RécapitulatifRowTone = "offered" | "muted"

export interface RécapitulatifRow {
  label: string
  value: string
  kind: RécapitulatifRowKind
  tone?: RécapitulatifRowTone
}

export interface RécapitulatifFacts {
  sousTotal: number
  shipping: { fee: number | null; city?: string } | null
  total: number | null
}

export function récapitulatifRows(
  facts: RécapitulatifFacts
): RécapitulatifRow[] {
  const rows: RécapitulatifRow[] = [
    {
      label: "Sous-total (TVA incluse)",
      value: formatPrice(facts.sousTotal),
      kind: "detail",
    },
  ]

  const shippingLabel = facts.shipping?.city
    ? `Livraison (${facts.shipping.city})`
    : "Livraison"

  if (facts.shipping === null || facts.shipping.fee === null) {
    rows.push({
      label: shippingLabel,
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
  } else if (facts.shipping.fee === 0) {
    rows.push({
      label: shippingLabel,
      value: formatShippingFee(0),
      kind: "detail",
      tone: "offered",
    })
  } else {
    rows.push({
      label: shippingLabel,
      value: formatPrice(facts.shipping.fee),
      kind: "detail",
    })
  }

  if (facts.total !== null) {
    rows.push({
      label: "Total à payer à la livraison",
      value: formatPrice(facts.total),
      kind: "total",
    })
  }

  return rows
}
