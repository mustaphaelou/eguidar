import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"
import { indexProductDocuments } from "@/lib/meili"
import type { StructureEffects } from "@/lib/use-cases/admin-structure"

export const realStructureEffects: StructureEffects = {
  reindexProducts: indexProductDocuments,
  revalidateCategories() {
    invalidateStructure()
  },
}
