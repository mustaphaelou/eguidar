import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  ensureProductsIndex,
  getMeiliSearch,
  moteurMeili,
  PRODUCTS_INDEX,
} from "@/lib/meili"
import type { IndexableProduct } from "@/lib/index-projection"
import { lectureDesStructures } from "@/lib/use-cases/lecture-structure"
import { searchProducts } from "@/lib/use-cases/search"
import { faitsDesCategoriesRecherche } from "@/test/recherche-fixtures"

const meili = getMeiliSearch()

const TASK_WAIT_TIMEOUT = 60_000

describe.runIf(!!meili)("search products against Meilisearch", () => {
  const client = meili!
  const runId = randomUUID().slice(0, 8)
  const smartphonesSlug = `srch-${runId}-smartphones`
  const audioSlug = `srch-${runId}-audio`
  const token = `recherchetest${runId}`
  const name = (label: string) => `RechercheTest${runId} ${label}`

  const structure = lectureDesStructures(
    faitsDesCategoriesRecherche({ smartphonesSlug, audioSlug })
  )

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
    const task = await client.index(PRODUCTS_INDEX).addDocuments(docs)
    await client.tasks.waitForTask(task.taskUid, {
      timeout: TASK_WAIT_TIMEOUT,
    })
  }, TASK_WAIT_TIMEOUT)

  afterAll(async () => {
    const smartphonesTask = await client.index(PRODUCTS_INDEX).deleteDocuments({
      filter: `categorySlug = "${smartphonesSlug}"`,
    })
    const audioTask = await client.index(PRODUCTS_INDEX).deleteDocuments({
      filter: `categorySlug = "${audioSlug}"`,
    })
    await Promise.all(
      [smartphonesTask, audioTask].map((task) =>
        client.tasks.waitForTask(task.taskUid, { timeout: TASK_WAIT_TIMEOUT })
      )
    )
  }, TASK_WAIT_TIMEOUT)

  it("matches a French product name with a typo", async () => {
    const iphone = await searchProducts(
      "ipone",
      {
        categorySlug: smartphonesSlug,
      },
      {},
      moteurMeili(),
      structure
    )
    expect(iphone.totalHits).toBe(1)
    expect(iphone.products[0].name).toBe(name("iPhone 15 Pro"))

    const samsung = await searchProducts(
      "samsng",
      {
        categorySlug: smartphonesSlug,
      },
      {},
      moteurMeili(),
      structure
    )
    expect(samsung.products.map((p) => p.name)).toEqual([
      name("Samsung Galaxy S24"),
    ])
  })

  it("is case-insensitive and accent-insensitive", async () => {
    const result = await searchProducts(
      "ECRAN 27 POUCES",
      {
        categorySlug: audioSlug,
      },
      {},
      moteurMeili(),
      structure
    )
    expect(result.products.map((p) => p.name)).toEqual([
      name("Écran 27 pouces 4K"),
    ])

    const accent = await searchProducts(
      "ecran 27 pouces 4k",
      {
        categorySlug: audioSlug,
      },
      {},
      moteurMeili(),
      structure
    )
    expect(accent.products.map((p) => p.name)).toEqual([
      name("Écran 27 pouces 4K"),
    ])
  })

  it("ranks all-terms matches first", async () => {
    const result = await searchProducts(
      `${token} sony`,
      {},
      {},
      moteurMeili(),
      structure
    )

    expect(result.products[0]).toMatchObject({
      slug: `srch-${runId}-casque`,
      name: name("Casque Sony WH-1000XM5"),
      minPrice: 349900,
    })
  })

  it("répond par l'interface MoteurRecherche — fumée d'adaptateur", async () => {
    const reponse = await moteurMeili().chercher({
      query: token,
      filtres: { categorySlug: smartphonesSlug },
      taille: 24,
    })

    if (reponse.statut !== "ok") throw new Error("moteur Meili indisponible")
    expect(Array.isArray(reponse.documents)).toBe(true)
    expect(reponse.documents.length).toBeGreaterThan(0)
    expect(reponse.total).toBeGreaterThanOrEqual(reponse.documents.length)
    expect(typeof reponse.repartitions).toBe("object")
  })
})
