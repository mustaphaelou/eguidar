import { describe, expect, it } from "vitest"

import { minVariantPrice, prixVariante } from "@/lib/product-metrics"

describe("prixVariante", () => {
  it("applique l'écart de prix au prix de base", () => {
    expect(prixVariante(100000, 150000)).toBe(250000)
    expect(prixVariante(100000, -20000)).toBe(80000)
  })
})

describe("minVariantPrice", () => {
  it("retient la Variante la moins chère quand le Produit en a", () => {
    expect(
      minVariantPrice(100000, [
        { priceDelta: 150000, stock: 3 },
        { priceDelta: 0, stock: 1 },
        { priceDelta: 50000, stock: 0 },
      ])
    ).toBe(100000)
  })

  it("ignore le prix de base quand aucune Variante ne l'atteint", () => {
    expect(
      minVariantPrice(1799990, [
        { priceDelta: 1888800, stock: 0 },
        { priceDelta: 1888800, stock: 1 },
      ])
    ).toBe(3688790)
  })

  it("replie sur le prix de base sans Variante", () => {
    expect(minVariantPrice(1799990, [])).toBe(1799990)
  })
})
