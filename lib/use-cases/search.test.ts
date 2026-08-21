import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { ensureProductsIndex, getMeiliSearch, PRODUCTS_INDEX } from "@/lib/meili"
import type { IndexableProduct } from "@/lib/index-projection"
import {
  buildSearchFilter,
  buildSearchHref,
  escapeFilterValue,
  parseSearchParams,
  searchProducts,
} from "@/lib/use-cases/search"

const meili = getMeiliSearch()

describe("search filter building", () => {
  it("returns undefined when no filters are applied", () => {
    expect(buildSearchFilter({})).toBeUndefined()
  })

  it("quotes brand and category values", () => {
    expect(buildSearchFilter({ brand: "Sony" })).toBe('brand = "Sony"')
    expect(buildSearchFilter({ categorySlug: "audio-hifi" })).toBe(
      'categorySlug = "audio-hifi"'
    )
  })

  it("escapes quotes and backslashes inside values", () => {
    expect(escapeFilterValue('Sony "Ultra"')).toBe('Sony \\"Ultra\\"')
    expect(escapeFilterValue("A\\B")).toBe("A\\\\B")
    expect(buildSearchFilter({ brand: 'Sony "Ultra"' })).toBe('brand = "Sony \\"Ultra\\""')
  })

  it("combines multiple filters with AND", () => {
    expect(
      buildSearchFilter({ brand: "Sony", categorySlug: "audio-hifi", priceBucketId: "2500-5000" })
    ).toBe('brand = "Sony" AND categorySlug = "audio-hifi" AND (minPrice >= 250000 AND minPrice < 500000)')
  })

  it("drops unknown price bucket ids while keeping the others", () => {
    expect(buildSearchFilter({ brand: "Sony", priceBucketId: "inconnu" })).toBe('brand = "Sony"')
  })
})

describe("parseSearchParams", () => {
  it("extracts and trims the query", () => {
    expect(parseSearchParams({ q: "  casque  " }).query).toBe("casque")
  })

  it("takes the first value when a param is repeated", () => {
    expect(parseSearchParams({ q: ["casque", "clavier"] }).query).toBe("casque")
  })

  it("parses brand, category and price bucket filters", () => {
    expect(
      parseSearchParams({ q: "sony", marque: "Sony", categorie: "audio-hifi", prix: "2500-5000" })
    ).toEqual({
      query: "sony",
      filters: { brand: "Sony", categorySlug: "audio-hifi", priceBucketId: "2500-5000" },
    })
  })

  it("rejects unknown price buckets and keeps valid filters", () => {
    expect(parseSearchParams({ q: "sony", marque: "Sony", prix: "bogus" })).toEqual({
      query: "sony",
      filters: { brand: "Sony" },
    })
  })

  it("returns an empty query and empty filters for empty params", () => {
    expect(parseSearchParams({})).toEqual({ query: "", filters: {} })
  })
})

describe("buildSearchHref", () => {
  it("links back to the plain search when no filters are active", () => {
    expect(buildSearchHref("casque", {})).toBe("/recherche?q=casque")
  })

  it("preserves the query and existing filters when adding one", () => {
    expect(buildSearchHref("casque", { brand: "Sony" }, { categorySlug: "audio-hifi" })).toBe(
      "/recherche?q=casque&marque=Sony&categorie=audio-hifi"
    )
  })

  it("removes a filter when toggled off", () => {
    expect(buildSearchHref("casque", { brand: "Sony", categorySlug: "audio-hifi" }, { brand: undefined })).toBe(
      "/recherche?q=casque&categorie=audio-hifi"
    )
  })

  it("omits the query param when the query is empty", () => {
    expect(buildSearchHref("", { brand: "Sony" })).toBe("/recherche?marque=Sony")
  })
})

describe.runIf(!!meili)("search products against Meilisearch", () => {
  const client = meili!
  const runId = randomUUID().slice(0, 8)
  const smartphonesSlug = `srch-${runId}-smartphones`
  const audioSlug = `srch-${runId}-audio`
  const token = `recherchetest${runId}`
  const name = (label: string) => `RechercheTest${runId} ${label}`

  function makeDoc(
    id: string,
    overrides: Partial<IndexableProduct> = {}
  ): IndexableProduct {
    return {
      id,
      name: "RechercheTest Produit",
      slug: `srch-${runId}-${id}`,
      description: "Description de test",
      brand: "Marque",
      price: 100000,
      minPrice: 100000,
      totalStock: 5,
      images: [],
      categoryId: "cat",
      categorySlug: smartphonesSlug,
      categoryName: "Smartphones",
      isFeatured: false,
      freeShipping: false,
      priceBucket: "0-1000",
      updatedAt: Date.now(),
      ...overrides,
    }
  }

  const docs: IndexableProduct[] = [
    makeDoc("iphone", {
      name: name("iPhone 15 Pro"),
      brand: "Apple",
      price: 1249900,
      minPrice: 1249900,
      priceBucket: "10000-plus",
    }),
    makeDoc("samsung", {
      name: name("Samsung Galaxy S24"),
      brand: "Samsung",
      price: 699900,
      minPrice: 699900,
      priceBucket: "5000-10000",
    }),
    makeDoc("casque", {
      name: name("Casque Sony WH-1000XM5"),
      brand: "Sony",
      categorySlug: audioSlug,
      categoryName: "Audio & Hi-Fi",
      price: 349900,
      minPrice: 349900,
      priceBucket: "2500-5000",
      freeShipping: true,
    }),
    makeDoc("ecran", {
      name: name("Écran 27 pouces 4K"),
      brand: "LG",
      categorySlug: audioSlug,
      categoryName: "Audio & Hi-Fi",
      price: 159900,
      minPrice: 159900,
      priceBucket: "1000-2500",
    }),
    makeDoc("clavier", {
      name: name("Clavier mécanique"),
      brand: "Logitech",
      price: 39900,
      minPrice: 39900,
      priceBucket: "0-1000",
    }),
  ]

  beforeAll(async () => {
    await ensureProductsIndex(client)
    await prisma.category.createMany({
      data: [
        { name: "Smartphones", slug: smartphonesSlug },
        { name: "Audio & Hi-Fi", slug: audioSlug },
      ],
      skipDuplicates: true,
    })
    const task = await client.index(PRODUCTS_INDEX).addDocuments(docs)
    await client.tasks.waitForTask(task.taskUid)
  })

  afterAll(async () => {
    await client.index(PRODUCTS_INDEX).deleteDocuments({
      filter: `categorySlug = ${smartphonesSlug} OR categorySlug = ${audioSlug}`,
    })
    await prisma.category.deleteMany({
      where: { slug: { in: [smartphonesSlug, audioSlug] } },
    })
    await prisma.$disconnect()
  })

  it("matches a French product name with a typo", async () => {
    const iphone = await searchProducts("ipone", { categorySlug: smartphonesSlug })
    expect(iphone.totalHits).toBe(1)
    expect(iphone.products[0].name).toBe(name("iPhone 15 Pro"))

    const samsung = await searchProducts("samsng", { categorySlug: smartphonesSlug })
    expect(samsung.products.map((p) => p.name)).toEqual([name("Samsung Galaxy S24")])
  })

  it("is case-insensitive and accent-insensitive", async () => {
    const result = await searchProducts("ECRAN 27 POUCES", { categorySlug: audioSlug })
    expect(result.products.map((p) => p.name)).toEqual([name("Écran 27 pouces 4K")])

    const accent = await searchProducts("ecran 27 pouces 4k", { categorySlug: audioSlug })
    expect(accent.products.map((p) => p.name)).toEqual([name("Écran 27 pouces 4K")])
  })

  it("returns facets with counts matching the result set", async () => {
    const result = await searchProducts(token)

    expect(result.totalHits).toBe(5)
    expect(result.facets.brands).toEqual([
      { value: "Apple", count: 1 },
      { value: "LG", count: 1 },
      { value: "Logitech", count: 1 },
      { value: "Samsung", count: 1 },
      { value: "Sony", count: 1 },
    ])
    expect(result.facets.categories).toEqual([
      { value: audioSlug, name: "Audio & Hi-Fi", count: 2 },
      { value: smartphonesSlug, name: "Smartphones", count: 3 },
    ])
    expect(result.facets.priceBuckets).toEqual([
      { id: "0-1000", label: "Moins de 1 000 MAD", count: 1 },
      { id: "1000-2500", label: "1 000 – 2 500 MAD", count: 1 },
      { id: "2500-5000", label: "2 500 – 5 000 MAD", count: 1 },
      { id: "5000-10000", label: "5 000 – 10 000 MAD", count: 1 },
      { id: "10000-plus", label: "Plus de 10 000 MAD", count: 1 },
    ])
  })

  it("filters by brand and keeps facet counts consistent", async () => {
    const result = await searchProducts(token, { brand: "Sony" })

    expect(result.products.map((p) => p.name)).toEqual([name("Casque Sony WH-1000XM5")])
    expect(result.totalHits).toBe(1)
    expect(result.facets.brands).toEqual([{ value: "Sony", count: 1 }])
    expect(result.facets.categories).toEqual([
      { value: audioSlug, name: "Audio & Hi-Fi", count: 1 },
    ])
  })

  it("filters by category", async () => {
    const result = await searchProducts("", { categorySlug: smartphonesSlug })

    expect(result.products.map((p) => p.name).sort()).toEqual([
      name("Clavier mécanique"),
      name("Samsung Galaxy S24"),
      name("iPhone 15 Pro"),
    ].sort())
    expect(result.facets.brands).toHaveLength(3)
  })

  it("filters by price bucket", async () => {
    const result = await searchProducts(token, { priceBucketId: "0-1000" })

    expect(result.products.map((p) => p.name)).toEqual([name("Clavier mécanique")])
    expect(result.totalHits).toBe(1)
    expect(result.facets.priceBuckets).toEqual([
      { id: "0-1000", label: "Moins de 1 000 MAD", count: 1 },
    ])
  })

  it("combines text query with facets", async () => {
    const result = await searchProducts(`${token} sony`, { priceBucketId: "2500-5000" })

    expect(result.products.map((p) => p.name)).toEqual([name("Casque Sony WH-1000XM5")])
  })

  it("returns an empty state when nothing matches", async () => {
    const result = await searchProducts("zzzqqqq")
    expect(result.totalHits).toBe(0)
    expect(result.products).toEqual([])
    expect(result.facets.brands).toEqual([])
  })

  it("maps hits to search result cards", async () => {
    const result = await searchProducts(`${token} casque`)
    expect(result.products[0]).toMatchObject({
      slug: `srch-${runId}-casque`,
      name: name("Casque Sony WH-1000XM5"),
      brand: "Sony",
      minPrice: 349900,
      totalStock: 5,
      freeShipping: true,
    })
  })
})
