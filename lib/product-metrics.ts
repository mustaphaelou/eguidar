export interface VariantPriceAndStock {
  priceDelta: number
  stock: number
}

export function prixVariante(basePrice: number, priceDelta: number): number {
  return basePrice + priceDelta
}

export function minVariantPrice(
  basePrice: number,
  variants: VariantPriceAndStock[]
): number {
  return variants.reduce(
    (min, variant) =>
      Math.min(min, prixVariante(basePrice, variant.priceDelta)),
    basePrice
  )
}

export function totalVariantStock(
  variants: readonly { stock: number }[]
): number {
  return variants.reduce((sum, variant) => sum + variant.stock, 0)
}

export function urlsImagesProduit(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === "string")
    : []
}

export function specificationsProduit(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  const specifications: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(value)) {
    if (typeof valeur !== "string") return {}
    specifications[cle] = valeur
  }
  return specifications
}
