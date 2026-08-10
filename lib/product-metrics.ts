export interface VariantPriceAndStock {
  priceDelta: number
  stock: number
}

export function minVariantPrice(basePrice: number, variants: VariantPriceAndStock[]): number {
  return variants.reduce(
    (min, variant) => Math.min(min, basePrice + variant.priceDelta),
    basePrice
  )
}

export function totalVariantStock(variants: VariantPriceAndStock[]): number {
  return variants.reduce((sum, variant) => sum + variant.stock, 0)
}
