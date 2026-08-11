import { revalidateTag } from "next/cache"

import { prisma } from "@/lib/db"
import { indexProductDocuments } from "@/lib/meili"
import { toIndexableProduct } from "@/lib/use-cases/admin-catalog"
import type { StructureEffects } from "@/lib/use-cases/admin-structure"
import { HOME_TAG, PRODUCT_TAG } from "@/lib/use-cases/catalog-effects"
import { realLivraisonEffects } from "@/lib/use-cases/livraison-effects"

export { SHIPPING_TAG } from "@/lib/use-cases/livraison-effects"

export const CATEGORY_TAG = "categories"

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
    revalidateTag(CATEGORY_TAG, "max")
    revalidateTag(PRODUCT_TAG, "max")
    revalidateTag(HOME_TAG, "max")
  },
  revalidateShipping() {
    realLivraisonEffects.revalidateShipping()
  },
}
