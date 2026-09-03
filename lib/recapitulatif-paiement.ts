import { formatPrice, formatShippingFee } from "@/lib/money"

export type RécapitulatifRowKind = "detail" | "total"
export type RécapitulatifRowTone = "offered" | "muted"

export interface RécapitulatifRow {
  label: string
  value: string
  kind: RécapitulatifRowKind
  tone?: RécapitulatifRowTone
}

/**
 * Entrée Commande du Récapitulatif de paiement (forme structurelle minimale).
 *
 * `OrderDetail`, `AdminOrderDetail` et `OrderEmailSnapshot` satisfont déjà
 * cette forme sans import nouveau. Le Total à payer est consommé tel quel
 * (`totalPayable` précalculé), jamais re-dérivé de `total + shippingFee`.
 */
export interface CommandePourRécapitulatif {
  total: number
  shippingFee: number
  totalPayable: number
  cityName?: string | null
}

/**
 * Faits normalisés — seul chemin de construction des lignes.
 *
 * `shipping: null` est le seul cas « À choisir » (aucun Devis sélectionné).
 * Le Devis ne produit que `null` (sans ville) ou `{ fee: number, city }`
 * (avec ville validée), et `fromCommande` n'émet que `{ fee: number, city? }`
 * (la Commande porte toujours des frais numériques). `total: null` omet la
 * ligne Total (Devis sans ville) ; la Commande fournit toujours son
 * `totalPayable`.
 *
 * Exporté pour le Devis, seul consommateur avec la Commande : la formulation
 * (offerte / À choisir / libellés) vit ici, en un seul endroit.
 */
export type FaitsRécapitulatif = {
  sousTotal: number
  shipping: { fee: number; city?: string } | null
  total: number | null
}

export function construireLignes(faits: FaitsRécapitulatif): RécapitulatifRow[] {
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

/**
 * Construit les lignes Sous-total / Livraison / Total à payer depuis une Commande.
 *
 * Consomme le `totalPayable` précalculé de la Commande, jamais
 * `total + shippingFee`.
 */
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
