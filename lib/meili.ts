import { Meilisearch } from "meilisearch"

import type { IndexableProduct } from "@/lib/index-projection"

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

const SEARCHABLE_PRODUCT_ATTRIBUTES = ["name", "brand", "categoryName", "description"]

export async function ensureProductsIndex(meili: Meilisearch) {
  const settings = {
    searchableAttributes: SEARCHABLE_PRODUCT_ATTRIBUTES,
    filterableAttributes: ["brand", "categorySlug", "minPrice", "priceBucket"],
    localizedAttributes: [
      {
        attributePatterns: SEARCHABLE_PRODUCT_ATTRIBUTES,
        locales: ["fr"],
      },
    ],
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

export async function indexProductDocuments(products: IndexableProduct[]) {
  const meili = getMeiliSearch()
  if (!meili || products.length === 0) return
  await ensureProductsIndex(meili)
  await meili.index(PRODUCTS_INDEX).addDocuments(products, { primaryKey: "id" })
}

export async function deleteProductDocument(productId: string) {
  const meili = getMeiliSearch()
  if (!meili) return
  return meili.index(PRODUCTS_INDEX).deleteDocument(productId)
}
