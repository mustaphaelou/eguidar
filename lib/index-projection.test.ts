import { describe, expect, it } from "vitest"

import { toIndexableProduct } from "@/lib/index-projection"

type ProductRecord = Parameters<typeof toIndexableProduct>[0]

function makeProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "p-1",
    name: "Produit Test",
    slug: "produit-test",
    description: "Une description",
    brand: "Marque Test",
    price: 100000,
    specs: {},
    images: ["https://example.com/img.jpg"],
    isFeatured: false,
    freeShipping: false,
    updatedAt: new Date("2026-08-21T12:00:00.000Z"),
    variants: [
      { name: "Modèle standard", sku: "P1-STD", priceDelta: 0, stock: 5 },
    ],
    category: { id: "cat-1", slug: "categorie-1", name: "Catégorie 1" },
    ...overrides,
  }
}

describe("toIndexableProduct", () => {
  it("keeps the passthrough fields as-is", () => {
    const product = makeProduct()

    const doc = toIndexableProduct(product)

    expect(doc).toMatchObject({
      id: "p-1",
      name: "Produit Test",
      slug: "produit-test",
      description: "Une description",
      brand: "Marque Test",
      price: 100000,
      isFeatured: false,
      freeShipping: false,
    })
  })

  it("computes minPrice over base price plus variant deltas", () => {
    const doc = toIndexableProduct(
      makeProduct({ variants: [{ name: "Var", sku: "V1", priceDelta: 150000, stock: 3 }] })
    )

    expect(doc.minPrice).toBe(100000)
  })

  it("uses the lowest variant price", () => {
    const doc = toIndexableProduct(
      makeProduct({
        variants: [
          { name: "Var", sku: "V1", priceDelta: -20000, stock: 3 },
          { name: "Var", sku: "V2", priceDelta: 150000, stock: 3 },
        ],
      })
    )

    expect(doc.minPrice).toBe(80000)
  })

  it("sums variant stocks", () => {
    const doc = toIndexableProduct(
      makeProduct({
        variants: [
          { name: "Var", sku: "V1", priceDelta: 0, stock: 5 },
          { name: "Var", sku: "V2", priceDelta: -20000, stock: 7 },
        ],
      })
    )

    expect(doc.totalStock).toBe(12)
  })

  it("buckets the minimum price, not the base price", () => {
    const doc = toIndexableProduct(
      makeProduct({ variants: [{ name: "Var", sku: "V1", priceDelta: -1, stock: 5 }] })
    )

    expect(doc.minPrice).toBe(99999)
    expect(doc.priceBucket).toBe("0-1000")
  })

  it("buckets the boundary prices", () => {
    expect(toIndexableProduct(makeProduct({ price: 99999 })).priceBucket).toBe("0-1000")
    expect(toIndexableProduct(makeProduct({ price: 100000 })).priceBucket).toBe("1000-2500")
    expect(toIndexableProduct(makeProduct({ price: 250000 })).priceBucket).toBe("2500-5000")
    expect(toIndexableProduct(makeProduct({ price: 1000000 })).priceBucket).toBe("10000-plus")
  })

  it("coerces images to an array of strings", () => {
    expect(
      toIndexableProduct(makeProduct({ images: ["a.jpg", 42, null] })).images
    ).toEqual(["a.jpg"])
    expect(toIndexableProduct(makeProduct({ images: "not-an-array" })).images).toEqual([])
    expect(toIndexableProduct(makeProduct({ images: [] })).images).toEqual([])
  })

  it("joins the category fields", () => {
    const doc = toIndexableProduct(
      makeProduct({ category: { id: "cat-9", slug: "magasins", name: "Magasins" } })
    )

    expect(doc).toMatchObject({ categoryId: "cat-9", categorySlug: "magasins", categoryName: "Magasins" })
  })

  it("converts updatedAt to milliseconds", () => {
    const doc = toIndexableProduct(makeProduct())

    expect(doc.updatedAt).toBe(new Date("2026-08-21T12:00:00.000Z").getTime())
  })

  it("flattens specs keys and values into searchable text", () => {
    const doc = toIndexableProduct(
      makeProduct({ specs: { Écran: "6.1 inch", Puce: "A17 Pro", Batterie: "3274 mAh" } })
    )

    expect(doc.specsText).toBe("Écran 6.1 inch Puce A17 Pro Batterie 3274 mAh")
  })

  it("keeps keys and only string-like values in specs text", () => {
    const doc = toIndexableProduct(
      makeProduct({ specs: { Écran: "6.1 inch", Stock: null, Puce: 42 } })
    )

    expect(doc.specsText).toBe("Écran 6.1 inch Stock Puce 42")
  })

  it("produces empty specs text for non-object specs", () => {
    expect(toIndexableProduct(makeProduct({ specs: undefined })).specsText).toBe("")
    expect(toIndexableProduct(makeProduct({ specs: "nope" })).specsText).toBe("")
    expect(toIndexableProduct(makeProduct({ specs: [] })).specsText).toBe("")
  })

  it("collects variant names and skus", () => {
    const doc = toIndexableProduct(
      makeProduct({
        variants: [
          { name: "128 Go", sku: "IP15P-128", priceDelta: 0, stock: 12 },
          { name: "256 Go", sku: "IP15P-256", priceDelta: 150000, stock: 8 },
        ],
      })
    )

    expect(doc.variantNames).toEqual(["128 Go", "256 Go"])
    expect(doc.skus).toEqual(["IP15P-128", "IP15P-256"])
  })
})
