import { priceBucketIdFor } from "@/lib/price-buckets"
import { minVariantPrice, totalVariantStock } from "@/lib/product-metrics"

export interface IndexableProduct {
  id: string
  name: string
  slug: string
  description: string
  brand: string
  price: number
  minPrice: number
  totalStock: number
  images: string[]
  categoryId: string
  categorySlug: string
  categoryName: string
  specsText: string
  variantNames: string[]
  skus: string[]
  isFeatured: boolean
  freeShipping: boolean
  priceBucket: string
  updatedAt: number
}

function specsToText(specs: unknown): string {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return ""
  return Object.entries(specs as Record<string, unknown>)
    .flatMap(([key, value]) => {
      if (typeof value === "string") return [key, value]
      if (typeof value === "number" || typeof value === "boolean")
        return [key, String(value)]
      return [key]
    })
    .join(" ")
}

export function toIndexableProduct(product: {
  id: string
  name: string
  slug: string
  description: string
  brand: string
  price: number
  specs: unknown
  images: unknown
  isFeatured: boolean
  freeShipping: boolean
  updatedAt: Date
  variants: { priceDelta: number; stock: number; name: string; sku: string }[]
  category: { id: string; slug: string; name: string }
}): IndexableProduct {
  const minPrice = minVariantPrice(product.price, product.variants)
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    price: product.price,
    minPrice,
    totalStock: totalVariantStock(product.variants),
    images: Array.isArray(product.images)
      ? product.images.filter((i): i is string => typeof i === "string")
      : [],
    categoryId: product.category.id,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    specsText: specsToText(product.specs),
    variantNames: product.variants.map((variant) => variant.name),
    skus: product.variants.map((variant) => variant.sku),
    isFeatured: product.isFeatured,
    freeShipping: product.freeShipping,
    priceBucket: priceBucketIdFor(minPrice),
    updatedAt: product.updatedAt.getTime(),
  }
}
