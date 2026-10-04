import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  deleteProductDocument,
  ensureProductsIndex,
  getMeiliSearch,
  PRODUCTS_INDEX,
} from "@/lib/meili"
import type { IndexableProduct } from "@/lib/index-projection"

const meili = getMeiliSearch()
const runId = randomUUID()

// large timeout: parallel mutation suites with default effects queue many Meili tasks
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
