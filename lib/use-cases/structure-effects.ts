import { prisma } from "@/lib/db"
import { indexProductDocuments } from "@/lib/meili"
import { toIndexableProduct } from "@/lib/use-cases/admin-catalog"
import type { StructureEffects } from "@/lib/use-cases/admin-structure"
import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"

export async function reindexCategoryProducts(categoryId: string): Promise<void> {
  const products = await prisma.product.findMany({
    where: { categoryId },
    include: { variants: true, category: true },
  })
  if (products.length === 0) return
  await indexProductDocuments(products.map(toIndexableProduct))
}

export const realStructureEffects: StructureEffects = {
  reindexCategoryProducts,
  revalidateCategories() {
    invalidateStructure()
  },
}
