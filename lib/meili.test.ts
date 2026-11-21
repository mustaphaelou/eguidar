import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  deleteProductDocument,
  ensureProductsIndex,
  getMeiliSearch,
  PRODUCTS_INDEX,
} from "@/lib/meili"
import {
  toIndexableProduct,
  type IndexableProduct,
} from "@/lib/index-projection"

const meili = getMeiliSearch()
const runId = randomUUID()

const TASK_WAIT_TIMEOUT = 60_000

function makeDoc(id: string): IndexableProduct {
  return {
    id,
    name: "Produit Meili Test",
    slug: `meili-${runId}-${id}`,
    description: "Description de test",
    brand: "Marque Meili",
    price: 50000,
    minPrice: 50000,
    totalStock: 12,
    images: [],
    categorySlug: "categorie-meili",
    categoryName: "Catégorie Meili",
    specsText: "",
    variantNames: [],
    skus: [],
    isFeatured: true,
    freeShipping: false,
    priceBucket: "0-1000",
    updatedAt: Date.now(),
  }
}

describe.runIf(!!meili)("Meilisearch product index", () => {
  const client = meili!

  beforeAll(async () => {
    await ensureProductsIndex(client)
  })

  afterAll(async () => {
    await client
      .index(PRODUCTS_INDEX)
      .deleteDocuments({ filter: `categorySlug = categorie-meili` })
  })

  it(
    "indexes a product so it becomes searchable",
    { timeout: TASK_WAIT_TIMEOUT },
    async () => {
      const id = randomUUID()
      const doc = makeDoc(id)

      const task = await client.index(PRODUCTS_INDEX).addDocuments([doc])
      await client.tasks.waitForTask(task.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })

      const results = await client
        .index(PRODUCTS_INDEX)
        .search("Produit Meili Test")
      const hit = results.hits.find((h) => h.id === id)
      expect(hit).toMatchObject({ id, brand: "Marque Meili", price: 50000 })
    }
  )

  it(
    "stores the Variant price, not the base price, in the indexed Document",
    { timeout: TASK_WAIT_TIMEOUT },
    async () => {
      const id = randomUUID()
      const doc = toIndexableProduct({
        id,
        name: `iPhone de sonde ${id}`,
        slug: `meili-prix-${id}`,
        description: "",
        brand: "Apple",
        price: 1_799_990,
        specs: {},
        images: [],
        isFeatured: false,
        freeShipping: true,
        updatedAt: new Date(),
        variants: [
          {
            priceDelta: 1_888_800,
            stock: 1,
            name: "512 Go",
            sku: `SKU-${id}`,
          },
        ],
        category: {
          id: "categorie-meili",
          slug: "categorie-meili",
          name: "Catégorie Meili",
        },
      })
      expect(doc.minPrice).toBe(3_688_790)

      const task = await client.index(PRODUCTS_INDEX).addDocuments([doc])
      await client.tasks.waitForTask(task.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })

      const results = await client.index(PRODUCTS_INDEX).search(doc.name)
      const hit = results.hits.find((candidat) => candidat.id === id)
      expect(hit?.minPrice).toBe(3_688_790)
      expect(hit?.price).toBe(1_799_990)
    }
  )

  it(
    "removes a product from the index",
    { timeout: TASK_WAIT_TIMEOUT },
    async () => {
      const id = randomUUID()
      const doc = makeDoc(id)

      const addTask = await client.index(PRODUCTS_INDEX).addDocuments([doc])
      await client.tasks.waitForTask(addTask.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })

      const deleteTask = await deleteProductDocument(id)
      await client.tasks.waitForTask(deleteTask!.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })

      const results = await client
        .index(PRODUCTS_INDEX)
        .search("Produit Meili Test")
      expect(results.hits.some((h) => h.id === id)).toBe(false)
    }
  )
})
