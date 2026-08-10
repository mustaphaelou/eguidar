import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  deleteProductDocument,
  ensureProductsIndex,
  getMeiliSearch,
  PRODUCTS_INDEX,
} from "@/lib/meili"
import type { IndexableProduct } from "@/lib/use-cases/admin-catalog"

const meili = getMeiliSearch()
const runId = randomUUID()

function makeDoc(id: string): IndexableProduct {
  return {
    id,
    name: "Produit Meili Test",
    slug: `meili-${runId}-${id}`,
    description: "Description de test",
    brand: "Marque Meili",
    price: 50000,
    totalStock: 12,
    images: [],
    categoryId: "cat-1",
    categorySlug: "categorie-meili",
    categoryName: "Catégorie Meili",
    isFeatured: true,
    freeShipping: false,
    updatedAt: Date.now(),
  }
}

describe.runIf(!!meili)("Meilisearch product index", () => {
  const client = meili!

  beforeAll(async () => {
    await ensureProductsIndex(client)
  })

  afterAll(async () => {
    await client.index(PRODUCTS_INDEX).deleteDocuments({ filter: `categorySlug = categorie-meili` })
  })

  it("indexes a product so it becomes searchable", async () => {
    const id = randomUUID()
    const doc = makeDoc(id)

    const task = await client.index(PRODUCTS_INDEX).addDocuments([doc])
    await client.tasks.waitForTask(task.taskUid)

    const results = await client.index(PRODUCTS_INDEX).search("Produit Meili Test")
    const hit = results.hits.find((h) => h.id === id)
    expect(hit).toMatchObject({ id, brand: "Marque Meili", price: 50000 })
  })

  it("removes a product from the index", async () => {
    const id = randomUUID()
    const doc = makeDoc(id)

    const addTask = await client.index(PRODUCTS_INDEX).addDocuments([doc])
    await client.tasks.waitForTask(addTask.taskUid)

    const deleteTask = await deleteProductDocument(id)
    await client.tasks.waitForTask(deleteTask!.taskUid)

    const results = await client.index(PRODUCTS_INDEX).search("Produit Meili Test")
    expect(results.hits.some((h) => h.id === id)).toBe(false)
  })
})
