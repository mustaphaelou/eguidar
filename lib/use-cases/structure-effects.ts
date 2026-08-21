import { indexProductDocuments } from "@/lib/meili"
import type { StructureEffects } from "@/lib/use-cases/admin-structure"
import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"

export const realStructureEffects: StructureEffects = {
  async reindexProducts(products) {
    await indexProductDocuments(products)
  },
  revalidateCategories() {
    invalidateStructure()
  },
}
