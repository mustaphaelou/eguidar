import { Meilisearch } from "meilisearch"

import type { IndexableProduct } from "@/lib/use-cases/admin-catalog"

const globalForMeili = globalThis as unknown as { meili?: Meilisearch }

export const PRODUCTS_INDEX = "products"

export function getMeiliSearch() {
  const host = process.env.MEILI_URL
  const apiKey = process.env.MEILI_MASTER_KEY
  if (!host) return null
  if (!globalForMeili.meili) {
    globalForMeili.meili = new Meilisearch({ host, apiKey })
  }
  return globalForMeili.meili
}

export async function ensureProductsIndex(meili: Meilisearch) {
  const settings = {
    filterableAttributes: ["brand", "categorySlug", "price", "totalStock"],
  }
  try {
    await meili.index(PRODUCTS_INDEX).fetchInfo()
  } catch {
    await meili.createIndex(PRODUCTS_INDEX, { primaryKey: "id" })
    await meili.index(PRODUCTS_INDEX).updateSettings(settings)
    return
  }
  await meili.index(PRODUCTS_INDEX).update({ primaryKey: "id" })
  await meili.index(PRODUCTS_INDEX).updateSettings(settings)
}

export async function indexProductDocument(product: IndexableProduct) {
  const meili = getMeiliSearch()
  if (!meili) return
  await ensureProductsIndex(meili)
  await meili.index(PRODUCTS_INDEX).addDocuments([product], { primaryKey: "id" })
}

export async function deleteProductDocument(productId: string) {
  const meili = getMeiliSearch()
  if (!meili) return
  return meili.index(PRODUCTS_INDEX).deleteDocument(productId)
}
