import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"
import { indexProductDocuments } from "@/lib/meili"
import { deleteR2Object } from "@/lib/r2"
import type { StructureEffects } from "@/lib/use-cases/admin-structure"

export const realStructureEffects: StructureEffects = {
  reindexProducts: indexProductDocuments,
  revalidateCategories() {
    invalidateStructure()
  },
  async deleteImage(url) {
    try {
      await deleteR2Object(url)
    } catch {
      // Best-effort : un échec de suppression R2 ne doit pas bloquer la mutation.
    }
  },
}
