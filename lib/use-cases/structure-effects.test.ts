import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { ensureProductsIndex, getMeiliSearch, PRODUCTS_INDEX } from "@/lib/meili"
import { reindexCategoryProducts } from "@/lib/use-cases/structure-effects"

const meili = getMeiliSearch()
const runId = randomUUID().slice(0, 8)
const categorySlug = `struc-eff-${runId}-categorie`
const productSlug = (suffix: string) => `struc-eff-${runId}-${suffix}`

async function waitForHit(searchTerm: string, categoryName: string): Promise<void> {
  const client = meili!
  for (let attempt = 0; attempt < 20; attempt++) {
    const results = await client.index(PRODUCTS_INDEX).search(searchTerm)
    const hit = results.hits.find((h) => h.categorySlug === categorySlug)
    if (hit && hit.categoryName === categoryName) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error("document not refreshed in the Meilisearch index")
}

describe.runIf(!!meili)("structure effects — category re-index", () => {
  let categoryId: string
  let productName: string

  beforeAll(async () => {
    await ensureProductsIndex(meili!)
    const category = await prisma.category.create({
      data: { name: "Catégorie Effets", slug: categorySlug },
    })
    categoryId = category.id
    productName = `Produit Effets ${randomUUID().slice(0, 8)}`
    await prisma.product.create({
      data: {
        name: productName,
        slug: productSlug("produit"),
        description: "desc",
        brand: "Marque Effets",
        price: 50000,
        specs: {},
        images: [],
        categoryId,
        variants: {
          create: { name: "Standard", sku: `STRUC-EFF-${runId}`, priceDelta: 0, stock: 5 },
        },
      },
    })
  })

  afterAll(async () => {
    await meili!.index(PRODUCTS_INDEX).deleteDocuments({ filter: `categorySlug = ${categorySlug}` })
    await prisma.product.deleteMany({ where: { slug: { startsWith: `struc-eff-${runId}-` } } })
    await prisma.category.deleteMany({ where: { slug: categorySlug } })
    await prisma.$disconnect()
  })

  it("refreshes the indexed product documents after a category rename", async () => {
    await prisma.category.update({ where: { id: categoryId }, data: { name: "Catégorie Renommée" } })

    await reindexCategoryProducts(categoryId)

    await waitForHit(productName, "Catégorie Renommée")
    const results = await meili!.index(PRODUCTS_INDEX).search(productName)
    const hit = results.hits.find((h) => h.categorySlug === categorySlug)
    expect(hit).toMatchObject({
      name: productName,
      categorySlug,
      categoryName: "Catégorie Renommée",
    })
  })
})
