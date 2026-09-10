/**
 * Tarification pure de la Livraison — module client-safe.
 *
 * Ne doit jamais importer `@/lib/db` (ni aucun module qui l'importe) :
 * `computeCityQuotes` / `computeCityQuote` / `computeShippingFee` sont
 * consommés par le Devis côté client (`components/storefront/checkout-form.tsx`
 * via `@/lib/use-cases/devis-selection`). Un import serveur ici
 * réintroduirait `pg` (`require('dns')`) dans le bundle navigateur et
 * casserait `next build` (Turbopack). La partie accès base reste dans
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

export function computeCityQuote(
  city: DeliveryCityOption,
  pricing: PricingInput,
  freeShippingThreshold: number
): ShippingQuote {
  const shippingFee = computeShippingFee({
    subtotal: pricing.subtotal,
    cityFee: city.fee,
    freeShippingThreshold,
    anyFreeShippingItem: pricing.anyFreeShippingItem,
  })
  return {
    subtotal: pricing.subtotal,
    shippingFee,
    total: pricing.subtotal + shippingFee,
  }
}

export function computeCityQuotes(
  cities: DeliveryCityOption[],
  pricing: PricingInput,
  freeShippingThreshold: number
): Record<string, ShippingQuote> {
  const quotes: Record<string, ShippingQuote> = {}
  for (const city of cities) {
    quotes[city.id] = computeCityQuote(city, pricing, freeShippingThreshold)
  }
  return quotes
}
