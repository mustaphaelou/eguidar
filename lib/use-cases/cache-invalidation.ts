import { revalidatePath, revalidateTag } from "next/cache"

export const PRODUCT_TAG = "products"
export const HOME_TAG = "home"
export const CATEGORY_TAG = "categories"
export const BLOG_TAG = "blog"
export const productDetailTag = (slug: string) => `product:${slug}`
export const blogDetailTag = (slug: string) => `blog:${slug}`

export interface CatalogueEventProduct {
  id: string
  slug: string
  previousSlug?: string
}

export function invalidateCatalogue(product: CatalogueEventProduct): void {
  revalidateTag(PRODUCT_TAG, "max")
  revalidateTag(productDetailTag(product.slug), "max")
  if (product.previousSlug && product.previousSlug !== product.slug) {
    revalidateTag(productDetailTag(product.previousSlug), "max")
  }
  revalidateTag(HOME_TAG, "max")
  revalidatePath("/admin/produits")
  revalidatePath(`/admin/produits/${product.id}`)
}

export function invalidateStructure(): void {
  revalidateTag(CATEGORY_TAG, "max")
  revalidateTag(PRODUCT_TAG, "max")
  revalidateTag(HOME_TAG, "max")
  revalidatePath("/admin/categories")
}

export function invalidateLivraison(): void {
  revalidatePath("/admin/villes")
  revalidatePath("/admin/livraison")
}

export function invalidateCommande(orderId: string): void {
  revalidatePath("/admin")
  revalidatePath("/admin/commandes")
  revalidatePath(`/admin/commandes/${orderId}`)
  revalidatePath("/commandes")
  revalidatePath(`/commande/confirmation/${orderId}`)
}
