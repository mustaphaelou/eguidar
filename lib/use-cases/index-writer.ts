import { deleteProductDocument, indexProductDocuments } from "@/lib/meili"
import type { IndexableProduct } from "@/lib/index-projection"

export async function reindexProducts(products: IndexableProduct[]): Promise<void> {
  if (products.length === 0) return
  await indexProductDocuments(products)
}

export async function removeProductFromIndex(productId: string): Promise<void> {
  await deleteProductDocument(productId)
}
