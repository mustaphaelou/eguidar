import { revalidateTag } from "next/cache"

import { deleteProductDocument, indexProductDocument } from "@/lib/meili"
import type { CatalogEffects } from "@/lib/use-cases/admin-catalog"

export const PRODUCT_TAG = "products"
export const HOME_TAG = "home"
export const productDetailTag = (slug: string) => `product:${slug}`

export const realCatalogEffects: CatalogEffects = {
  async reindexProduct(product) {
    await indexProductDocument(product)
  },
  async removeProductFromIndex(productId) {
    await deleteProductDocument(productId)
  },
  revalidateCatalog(product) {
    revalidateTag(PRODUCT_TAG, "max")
    revalidateTag(productDetailTag(product.slug), "max")
    if (product.previousSlug && product.previousSlug !== product.slug) {
      revalidateTag(productDetailTag(product.previousSlug), "max")
    }
    revalidateTag(HOME_TAG, "max")
  },
}
