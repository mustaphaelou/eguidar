import { formatPrice, formatShippingFee } from "@/lib/money"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison"

export type RécapitulatifRowKind = "detail" | "total"
export type RécapitulatifRowTone = "offered" | "muted"

export interface RécapitulatifRow {
  label: string
  value: string
  kind: RécapitulatifRowKind
  tone?: RécapitulatifRowTone
}

/**
 * Entrée Devis du Récapitulatif de paiement.
 *
 * Le Devis calcule le prix d'un panier selon la Ville de livraison :
 * villes disponibles + devis par ville + identifiant de ville optionnel.
 * Un `PanierQuote` étalé (`{ ...panierQuote, sousTotal, selectedCityId }`)
 * satisfait cette forme ; `threshold` / `selected` sont ignorés — la
 * résolution `quotes[cityId]` + `cities.find(id)` vit derrière l'interface.
 */
export interface DevisPourRécapitulatif {
  sousTotal: number
  cities: DeliveryCityOption[]
  quotes: Record<string, ShippingQuote>
  selectedCityId?: string | null
  /** Champ du PanierQuote conservé par étalement — ignoré. */
  threshold?: number
  /** Champ du PanierQuote conservé par étalement — ignoré (source : quotes). */
  selected?: ShippingQuote | null
}

/** Alias historique du code pour le Devis (voir glossaire : Devis). */
export type QuotePourRécapitulatif = DevisPourRécapitulatif

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
 * Faits normalisés internes — seul chemin de construction des lignes.
 *
 * `shipping: null` est le seul cas « À choisir » (aucun Devis sélectionné).
 * L'orthographe `{ fee: null }` est supprimée : `fromDevis` n'émet que
 * `null` (sans ville) ou `{ fee: number, city }` (avec ville), et
 * `fromCommande` n'émet que `{ fee: number, city? }` (la Commande porte
 * toujours des frais numériques). `total: null` omet la ligne Total
 * (Devis sans ville) ; la Commande fournit toujours son `totalPayable`.
 */
type FaitsNormalisés = {
  sousTotal: number
  shipping: { fee: number; city?: string } | null
  total: number | null
}

function construireLignes(faits: FaitsNormalisés): RécapitulatifRow[] {
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
 * Construit les lignes Sous-total / Livraison / Total à payer depuis un Devis.
 *
 * Ville inconnue ou absente → repli « Livraison » sans ville + « À choisir »
 * + total omis (nul). Ne lève jamais.
 */
export function récapitulatifRowsFromDevis(
  devis: DevisPourRécapitulatif
): RécapitulatifRow[] {
  const cityId = devis.selectedCityId ?? null
  const quote = cityId ? (devis.quotes[cityId] ?? null) : null
  const city = cityId
    ? (devis.cities.find((c) => c.id === cityId) ?? null)
    : null

  if (!quote || !city) {
    return construireLignes({
      sousTotal: devis.sousTotal,
      shipping: null,
      total: null,
    })
  }

  return construireLignes({
    sousTotal: devis.sousTotal,
    shipping: { fee: quote.shippingFee, city: city.name },
    total: quote.total,
  })
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
