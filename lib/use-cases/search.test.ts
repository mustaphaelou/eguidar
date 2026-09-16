import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  ensureProductsIndex,
  getMeiliSearch,
  moteurMeili,
  PRODUCTS_INDEX,
} from "@/lib/meili"
import type { IndexableProduct } from "@/lib/index-projection"
import {
  buildSearchFilter,
  buildSearchHref,
  escapeFilterValue,
  parsePage,
  parseSearchParams,
  parseSort,
  retirerFacette,
  searchProducts,
  toggleBrand,
} from "@/lib/use-cases/search"

const meili = getMeiliSearch()

// large timeout: parallel mutation suites with default effects queue many Meili tasks
const TASK_WAIT_TIMEOUT = 60_000

/**
 * Le filtre de nettoyage du bloc Meili, construit comme `buildSearchFilter`
 * le construit — valeur citée — et jamais vide : le nettoyage ne peut pas
 * silencieusement devenir un `deleteDocuments({ filter: undefined })`.
 */
function filtreDeNettoyage(categorySlug: string): string {
  const filtre = buildSearchFilter({ categorySlug })
  if (!filtre) throw new Error("filtre de nettoyage vide")
  return filtre
}

describe("search filter building", () => {
  it("returns undefined when no filters are applied", () => {
    expect(buildSearchFilter({})).toBeUndefined()
  })

  it("builds a brand IN clause for one or several brands", () => {
    expect(buildSearchFilter({ brand: ["Sony"] })).toBe('brand IN ["Sony"]')
    expect(buildSearchFilter({ brand: ["Sony", "LG"] })).toBe(
      'brand IN ["Sony", "LG"]'
    )
  })

  it("quotes the category value", () => {
    expect(buildSearchFilter({ categorySlug: "audio-hifi" })).toBe(
      'categorySlug = "audio-hifi"'
    )
  })

  it("escapes quotes and backslashes inside values", () => {
    expect(escapeFilterValue('Sony "Ultra"')).toBe('Sony \\"Ultra\\"')
    expect(escapeFilterValue("A\\B")).toBe("A\\\\B")
    expect(buildSearchFilter({ brand: ['Sony "Ultra"', "A\\B"] })).toBe(
      'brand IN ["Sony \\"Ultra\\"", "A\\\\B"]'
    )
  })

  it("combines multiple filters with AND", () => {
    expect(
      buildSearchFilter({
        brand: ["Sony", "LG"],
        categorySlug: "audio-hifi",
        priceBucketId: "2500-5000",
      })
    ).toBe(
      'brand IN ["Sony", "LG"] AND categorySlug = "audio-hifi" AND (minPrice >= 250000 AND minPrice < 500000)'
    )
  })

  it("omits one facet clause without touching the others", () => {
    const filters = {
      brand: ["Sony"],
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    }
    expect(buildSearchFilter(filters, "brand")).toBe(
      'categorySlug = "audio-hifi" AND (minPrice >= 250000 AND minPrice < 500000)'
    )
    expect(buildSearchFilter(filters, "categorySlug")).toBe(
      'brand IN ["Sony"] AND (minPrice >= 250000 AND minPrice < 500000)'
    )
    expect(buildSearchFilter(filters, "priceBucket")).toBe(
      'brand IN ["Sony"] AND categorySlug = "audio-hifi"'
    )
  })

  it("drops unknown price bucket ids while keeping the others", () => {
    expect(
      buildSearchFilter({ brand: ["Sony"], priceBucketId: "inconnu" })
    ).toBe('brand IN ["Sony"]')
  })
})

describe("retirerFacette", () => {
  const filters = {
    brand: ["Sony"],
    categorySlug: "audio-hifi",
    priceBucketId: "2500-5000",
  }

  it("removes the targeted facet clause and keeps the other filters", () => {
    expect(retirerFacette(filters, "brand")).toEqual({
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
    expect(retirerFacette(filters, "categorySlug")).toEqual({
      brand: ["Sony"],
      priceBucketId: "2500-5000",
    })
    expect(retirerFacette(filters, "priceBucket")).toEqual({
      brand: ["Sony"],
      categorySlug: "audio-hifi",
    })
  })

  it("leaves empty filters empty", () => {
    expect(retirerFacette({}, "brand")).toEqual({})
  })

  it("removes the key instead of blanking it and never mutates its argument", () => {
    const restants = retirerFacette(filters, "brand")

    expect(restants).not.toBe(filters)
    expect("brand" in restants).toBe(false)
    expect(filters).toEqual({
      brand: ["Sony"],
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
  })
})

describe("parseSearchParams", () => {
  it("extracts and trims the query", () => {
    expect(parseSearchParams({ q: "  casque  " }).query).toBe("casque")
  })

  it("takes the first value when a param is repeated", () => {
    expect(parseSearchParams({ q: ["casque", "clavier"] }).query).toBe("casque")
  })

  it("parses a legacy single marque into a one-element brand list", () => {
    expect(
      parseSearchParams({
        q: "sony",
        marque: "Sony",
        categorie: "audio-hifi",
        prix: "2500-5000",
      })
    ).toEqual({
      query: "sony",
      filters: {
        brand: ["Sony"],
        categorySlug: "audio-hifi",
        priceBucketId: "2500-5000",
      },
      sort: "pertinence",
      page: 1,
    })
  })

  it("collects every repeated marque value without duplicates", () => {
    expect(
      parseSearchParams({ marque: ["Sony", "LG", "Sony"] }).filters
    ).toEqual({ brand: ["Sony", "LG"] })
  })

  it("trims and drops empty marque values", () => {
    expect(
      parseSearchParams({ marque: [" Sony ", "", "   ", "LG"] }).filters
    ).toEqual({ brand: ["Sony", "LG"] })
  })

  it("rejects unknown price buckets and keeps valid filters", () => {
    expect(
      parseSearchParams({ q: "sony", marque: "Sony", prix: "bogus" })
    ).toEqual({
      query: "sony",
      filters: { brand: ["Sony"] },
      sort: "pertinence",
      page: 1,
    })
  })

  it("returns an empty query and empty filters for empty params", () => {
    expect(parseSearchParams({})).toEqual({
      query: "",
      filters: {},
      sort: "pertinence",
      page: 1,
    })
  })

  it("parses sort and page params", () => {
    expect(parseSearchParams({ tri: "prix-asc", page: "3" }).sort).toBe(
      "prix-asc"
    )
    expect(parseSearchParams({ tri: "prix-asc", page: "3" }).page).toBe(3)
  })

  it("falls back to defaults for unknown sort and invalid page", () => {
    expect(parseSearchParams({ tri: "bogus", page: "-2" }).sort).toBe(
      "pertinence"
    )
    expect(parseSearchParams({ tri: "bogus", page: "-2" }).page).toBe(1)
    expect(parseSearchParams({ page: "2.5" }).page).toBe(1)
  })

  it("uses the provided default sort when tri is absent", () => {
    expect(parseSearchParams({}, "nouveautes").sort).toBe("nouveautes")
    expect(parseSearchParams({ tri: "prix-asc" }, "nouveautes").sort).toBe(
      "prix-asc"
    )
  })
})

describe("parseSort and parsePage", () => {
  it("accepts known sort values", () => {
    expect(parseSort("prix-asc")).toBe("prix-asc")
    expect(parseSort("prix-desc")).toBe("prix-desc")
    expect(parseSort("nouveautes")).toBe("nouveautes")
  })

  it("defaults unknown or empty sort to pertinence", () => {
    expect(parseSort("inconnu")).toBe("pertinence")
    expect(parseSort(undefined)).toBe("pertinence")
  })

  it("parses positive integer pages and defaults otherwise", () => {
    expect(parsePage("1")).toBe(1)
    expect(parsePage("24")).toBe(24)
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage("0")).toBe(1)
    expect(parsePage("abc")).toBe(1)
  })
})

describe("buildSearchHref", () => {
  it("links back to the plain search when no filters are active", () => {
    expect(buildSearchHref("casque", {})).toBe("/recherche?q=casque")
  })

  it("preserves the query and existing filters when adding one", () => {
    expect(
      buildSearchHref(
        "casque",
        { brand: ["Sony", "LG"] },
        { categorySlug: "audio-hifi" }
      )
    ).toBe("/recherche?q=casque&marque=Sony&marque=LG&categorie=audio-hifi")
  })

  it("serializes every selected brand as a repeated marque param", () => {
    expect(buildSearchHref("", { brand: ["Sony", "LG", "Logitech"] })).toBe(
      "/recherche?marque=Sony&marque=LG&marque=Logitech"
    )
  })

  it("removes a filter when toggled off", () => {
    expect(
      buildSearchHref(
        "casque",
        { brand: ["Sony", "LG"], categorySlug: "audio-hifi" },
        { brand: ["LG"] }
      )
    ).toBe("/recherche?q=casque&marque=LG&categorie=audio-hifi")
    expect(
      buildSearchHref("casque", { brand: ["Sony"] }, { brand: undefined })
    ).toBe("/recherche?q=casque")
  })

  it("omits the query param when the query is empty", () => {
    expect(buildSearchHref("", { brand: ["Sony"] })).toBe(
      "/recherche?marque=Sony"
    )
  })

  it("omits default sort and first page from the href", () => {
    expect(
      buildSearchHref("casque", {}, {}, { sort: "pertinence", page: 1 })
    ).toBe("/recherche?q=casque")
  })

  it("adds sort and page params when non-default", () => {
    expect(
      buildSearchHref("casque", {}, {}, { sort: "prix-asc", page: 2 })
    ).toBe("/recherche?q=casque&tri=prix-asc&page=2")
    expect(
      buildSearchHref("casque", {}, {}, { sort: "nouveautes", page: 1 })
    ).toBe("/recherche?q=casque&tri=nouveautes")
  })

  it("supports a custom path (catalogue)", () => {
    expect(
      buildSearchHref(
        "",
        { brand: ["Sony", "LG"] },
        {},
        { sort: "nouveautes" },
        "/produits"
      )
    ).toBe("/produits?marque=Sony&marque=LG&tri=nouveautes")
    expect(
      buildSearchHref("", {}, {}, { sort: "nouveautes" }, "/produits")
    ).toBe("/produits?tri=nouveautes")
  })
})

describe("toggleBrand", () => {
  it("adds a brand that is not selected yet", () => {
    expect(toggleBrand(["Sony"], "LG")).toEqual(["Sony", "LG"])
    expect(toggleBrand(undefined, "Sony")).toEqual(["Sony"])
  })

  it("removes a brand that is already selected", () => {
    expect(toggleBrand(["Sony", "LG"], "Sony")).toEqual(["LG"])
    expect(toggleBrand(["Sony"], "Sony")).toEqual([])
  })
})

/**
 * Ce que seul Meilisearch peut prouver : la tolérance aux fautes de frappe,
 * l'insensibilité à la casse et aux accents, et le classement par pertinence.
 * Le moteur en mémoire les laisse délibérément à Meili (ADR-0023) et ne les
 * imite pas ; les faits de la Recherche qui, eux, ne dépendent pas du moteur
 * — facettes, filtres, tris, pagination, suggestions — vivent désormais dans
 * `lib/use-cases/search-memoire.test.ts` et tournent sur la CI, sans
 * `MEILI_URL` ni Docker.
 */
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
      specsText: "",
      variantNames: [],
      skus: [],
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
      specsText: "Puce A17 Pro Caméra 48 MP",
      variantNames: ["128 Go", "256 Go"],
      skus: ["IP15P-128", "IP15P-256"],
      updatedAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
    }),
    makeDoc("samsung", {
      name: name("Samsung Galaxy S24"),
      brand: "Samsung",
      price: 699900,
      minPrice: 699900,
      priceBucket: "5000-10000",
      variantNames: ["256 Go"],
      skus: ["S24U-256"],
      updatedAt: new Date("2026-02-01T00:00:00.000Z").getTime(),
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
      updatedAt: new Date("2026-03-01T00:00:00.000Z").getTime(),
    }),
    makeDoc("ecran", {
      name: name("Écran 27 pouces 4K"),
      brand: "LG",
      categorySlug: audioSlug,
      categoryName: "Audio & Hi-Fi",
      price: 159900,
      minPrice: 159900,
      priceBucket: "1000-2500",
      updatedAt: new Date("2026-04-01T00:00:00.000Z").getTime(),
    }),
    makeDoc("clavier", {
      name: name("Clavier mécanique"),
      brand: "Logitech",
      price: 39900,
      minPrice: 39900,
      priceBucket: "0-1000",
      updatedAt: new Date("2026-05-01T00:00:00.000Z").getTime(),
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
    await client.tasks.waitForTask(task.taskUid, {
      timeout: TASK_WAIT_TIMEOUT,
    })
  }, TASK_WAIT_TIMEOUT)

  afterAll(async () => {
    // Les valeurs du filtre sont citées, exactement comme `buildSearchFilter`
    // les cite : sans guillemets Meili rejette le filtre et le nettoyage
    // laissait silencieusement les documents derrière lui.
    const smartphonesTask = await client.index(PRODUCTS_INDEX).deleteDocuments({
      filter: filtreDeNettoyage(smartphonesSlug),
    })
    const audioTask = await client.index(PRODUCTS_INDEX).deleteDocuments({
      filter: filtreDeNettoyage(audioSlug),
    })
    await Promise.all(
      [smartphonesTask, audioTask].map((task) =>
        client.tasks.waitForTask(task.taskUid, { timeout: TASK_WAIT_TIMEOUT })
      )
    )
    await prisma.category.deleteMany({
      where: { slug: { in: [smartphonesSlug, audioSlug] } },
    })
    await prisma.$disconnect()
  }, TASK_WAIT_TIMEOUT)

  it("matches a French product name with a typo", async () => {
    const iphone = await searchProducts("ipone", {
      categorySlug: smartphonesSlug,
    })
    expect(iphone.totalHits).toBe(1)
    expect(iphone.products[0].name).toBe(name("iPhone 15 Pro"))

    const samsung = await searchProducts("samsng", {
      categorySlug: smartphonesSlug,
    })
    expect(samsung.products.map((p) => p.name)).toEqual([
      name("Samsung Galaxy S24"),
    ])
  })

  it("is case-insensitive and accent-insensitive", async () => {
    const result = await searchProducts("ECRAN 27 POUCES", {
      categorySlug: audioSlug,
    })
    expect(result.products.map((p) => p.name)).toEqual([
      name("Écran 27 pouces 4K"),
    ])

    const accent = await searchProducts("ecran 27 pouces 4k", {
      categorySlug: audioSlug,
    })
    expect(accent.products.map((p) => p.name)).toEqual([
      name("Écran 27 pouces 4K"),
    ])
  })

  it("ranks all-terms matches first", async () => {
    const result = await searchProducts(`${token} sony`)

    expect(result.products[0]).toMatchObject({
      slug: `srch-${runId}-casque`,
      name: name("Casque Sony WH-1000XM5"),
      minPrice: 349900,
    })
  })

  it("répond par l'interface MoteurRecherche — fumée d'adaptateur", async () => {
    // Le seul fait que ce bloc doit à la couture : `moteurMeili()` satisfait
    // `MoteurRecherche`. Sous #367 cette réponse gagne un `statut: "ok"`.
    const reponse = await moteurMeili().chercher({
      query: token,
      filtres: { categorySlug: smartphonesSlug },
      taille: 24,
    })

    expect(Array.isArray(reponse.documents)).toBe(true)
    expect(reponse.documents.length).toBeGreaterThan(0)
    expect(reponse.total).toBeGreaterThanOrEqual(reponse.documents.length)
    expect(typeof reponse.repartitions).toBe("object")
  })
})
