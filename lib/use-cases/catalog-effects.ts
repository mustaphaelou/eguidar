import { invalidateCatalogue } from "@/lib/use-cases/cache-invalidation"
import { deleteProductDocument, indexProductDocuments } from "@/lib/meili"
import type { CatalogEffects } from "@/lib/use-cases/admin-catalog"

export const realCatalogEffects: CatalogEffects = {
  reindexProducts: indexProductDocuments,
  async removeProductFromIndex(productId) {
    await deleteProductDocument(productId)
  },
  revalidateCatalog(product) {
    invalidateCatalogue(product)
  },
}
