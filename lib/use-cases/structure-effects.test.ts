import { beforeEach, describe, expect, it, vi } from "vitest"

import type { IndexableProduct } from "@/lib/index-projection"
import { indexProductDocuments } from "@/lib/meili"
import { realStructureEffects } from "@/lib/use-cases/structure-effects"

vi.mock("@/lib/meili", () => ({
  indexProductDocuments: vi.fn(),
}))

vi.mock("@/lib/use-cases/cache-invalidation", () => ({
  invalidateStructure: vi.fn(),
}))

import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"

function makeDoc(id: string): IndexableProduct {
  return {
    id,
    name: "Produit Structure",
    slug: `structure-${id}`,
    description: "Description de test",
    brand: "Marque Structure",
    price: 10000,
    minPrice: 10000,
    totalStock: 3,
    images: [],
    categoryId: "cat-1",
    categorySlug: "categorie-structure",
    categoryName: "Catégorie Structure",
    isFeatured: false,
    freeShipping: false,
    priceBucket: "0-1000",
    updatedAt: Date.now(),
  }
}

describe("realStructureEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates reindexProducts to indexProductDocuments", async () => {
    const products = [makeDoc("p1"), makeDoc("p2")]

    await realStructureEffects.reindexProducts(products)

    expect(indexProductDocuments).toHaveBeenCalledWith(products)
  })

  it("delegates structure revalidation to invalidateStructure", () => {
    realStructureEffects.revalidateCategories()

    expect(invalidateStructure).toHaveBeenCalledOnce()
  })
})
