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
