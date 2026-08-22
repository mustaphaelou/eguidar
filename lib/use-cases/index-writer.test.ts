import { beforeEach, describe, expect, it, vi } from "vitest"

import type { IndexableProduct } from "@/lib/index-projection"
import { deleteProductDocument, indexProductDocuments } from "@/lib/meili"
import { removeProductFromIndex, reindexProducts } from "@/lib/use-cases/index-writer"

vi.mock("@/lib/meili", () => ({
  indexProductDocuments: vi.fn(),
  deleteProductDocument: vi.fn(),
}))

function makeDoc(id: string): IndexableProduct {
  return {
    id,
    name: "Produit Index Writer",
    slug: `writer-${id}`,
    description: "Description de test",
    brand: "Marque Index Writer",
    price: 10000,
    minPrice: 10000,
    totalStock: 3,
    images: [],
    categoryId: "cat-1",
    categorySlug: "categorie-writer",
    categoryName: "Catégorie Index Writer",
    specsText: "",
    variantNames: [],
    skus: [],
    isFeatured: false,
    freeShipping: false,
    priceBucket: "0-1000",
    updatedAt: Date.now(),
  }
}

describe("index writer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates reindexProducts to indexProductDocuments", async () => {
    const products = [makeDoc("p1"), makeDoc("p2")]

    await reindexProducts(products)

    expect(indexProductDocuments).toHaveBeenCalledWith(products)
  })

  it("does not call meilisearch when the product list is empty", async () => {
    await reindexProducts([])

    expect(indexProductDocuments).not.toHaveBeenCalled()
  })

  it("delegates removeProductFromIndex to deleteProductDocument", async () => {
    await removeProductFromIndex("p1")

    expect(deleteProductDocument).toHaveBeenCalledWith("p1")
  })
})
