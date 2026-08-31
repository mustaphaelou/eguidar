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

export function totalVariantStock(variants: VariantPriceAndStock[]): number {
  return variants.reduce((sum, variant) => sum + variant.stock, 0)
}
