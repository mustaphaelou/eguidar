import { invalidateCatalogue } from "@/lib/use-cases/cache-invalidation"
import { deleteProductDocument, indexProductDocuments } from "@/lib/meili"
import { deleteR2Object } from "@/lib/r2"
import type { CatalogEffects } from "@/lib/use-cases/admin-catalog"

export const realCatalogEffects: CatalogEffects = {
  reindexProducts: indexProductDocuments,
  async removeProductFromIndex(productId) {
    await deleteProductDocument(productId)
  },
  revalidateCatalog(product) {
    invalidateCatalogue(product)
  },
  async deleteImages(urls) {
    for (const url of urls) {
      try {
        await deleteR2Object(url)
      } catch {
        // Best-effort : un échec de suppression R2 ne doit pas bloquer la mutation.
      }
    }
  },
}
