import { invalidateCatalogue } from "@/lib/use-cases/cache-invalidation"
import { reindexProducts, removeProductFromIndex } from "@/lib/use-cases/index-writer"
import type { CatalogEffects } from "@/lib/use-cases/admin-catalog"

export const realCatalogEffects: CatalogEffects = {
  reindexProducts,
  removeProductFromIndex,
  revalidateCatalog(product) {
    invalidateCatalogue(product)
  },
}
