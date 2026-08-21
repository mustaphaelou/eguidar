import { deleteProductDocument, indexProductDocuments } from "@/lib/meili"
import type { CatalogEffects } from "@/lib/use-cases/admin-catalog"
import { invalidateCatalogue } from "@/lib/use-cases/cache-invalidation"

export const realCatalogEffects: CatalogEffects = {
  async reindexProducts(products) {
    await indexProductDocuments(products)
  },
  async removeProductFromIndex(productId) {
    await deleteProductDocument(productId)
  },
  revalidateCatalog(product) {
    invalidateCatalogue(product)
  },
}
