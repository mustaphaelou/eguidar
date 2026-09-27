/**
 * Tarification pure de la Livraison — module client-safe.
 *
 * Tient la règle de frais de livraison nommée (`computeShippingFee`), ses
 * types (`ShippingQuote`, `DeliveryCityOption`, `PricingInput`,
 * `ShippingFeeInput`, `DEFAULT_FREE_SHIPPING_THRESHOLD`) et sa classe
 * d'erreur (`DeliveryCityNotFoundError`) — rien d'autre : le chiffrage du
 * Panier ville par ville vit dans la porte serveur du Devis
 * (`chargerDevis`).
 *
 * Ne doit jamais importer `@/lib/db` (ni aucun module qui l'importe) : un
 * import serveur ici réintroduirait `pg` (`require('dns')`) dans le bundle
 * navigateur et casserait `next build` (Turbopack) — c'est cette garde qui
 * rend le module client-safe. La partie accès base reste dans
 * `@/lib/use-cases/livraison`, qui réexporte ce module pour
 * compatibilité ascendante.
 */
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export class DeliveryCityNotFoundError extends UserFacingError {
  constructor() {
    super("Ville de livraison introuvable")
    this.name = "DeliveryCityNotFoundError"
  }
}

export interface ShippingQuote {
  subtotal: number
  shippingFee: number
  total: number
}

export interface DeliveryCityOption {
  id: string
  slug: string
  name: string
  fee: number
}

export interface PricingInput {
  subtotal: number
  anyFreeShippingItem: boolean
}

export interface ShippingFeeInput {
  subtotal: number
  cityFee: number
  freeShippingThreshold: number
  anyFreeShippingItem: boolean
}

export const DEFAULT_FREE_SHIPPING_THRESHOLD = 100000

export function computeShippingFee(input: ShippingFeeInput): number {
  if (input.subtotal >= input.freeShippingThreshold) return 0
  if (input.anyFreeShippingItem) return 0
  return input.cityFee
}
