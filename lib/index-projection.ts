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
  isFeatured: boolean
  freeShipping: boolean
  priceBucket: string
  updatedAt: number
}

export function toIndexableProduct(product: {
  id: string
  name: string
  slug: string
  description: string
  brand: string
  price: number
  images: unknown
  isFeatured: boolean
  freeShipping: boolean
  updatedAt: Date
  variants: { priceDelta: number; stock: number }[]
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
    images: Array.isArray(product.images) ? product.images.filter((i): i is string => typeof i === "string") : [],
    categoryId: product.category.id,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    isFeatured: product.isFeatured,
    freeShipping: product.freeShipping,
    priceBucket: priceBucketIdFor(minPrice),
    updatedAt: product.updatedAt.getTime(),
  }
}
