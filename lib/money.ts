const madFormatter = new Intl.NumberFormat("fr-MA", {
  style: "currency",
  currency: "MAD",
  maximumFractionDigits: 2,
})

export function formatPrice(cents: number): string {
  return madFormatter.format(cents / 100)
}

export function formatShippingFee(cents: number): string {
  return cents === 0 ? "Livraison offerte" : formatPrice(cents)
}

export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function parseMadToCents(value: string): number | null {
  const parsed = Number(value.replace(",", "."))
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}
