import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"
import { reindexProducts } from "@/lib/use-cases/index-writer"
import type { StructureEffects } from "@/lib/use-cases/admin-structure"

export const realStructureEffects: StructureEffects = {
  reindexProducts,
  revalidateCategories() {
    invalidateStructure()
  },
}
