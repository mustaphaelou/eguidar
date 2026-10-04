import { priceBucketIdFor } from "@/lib/price-buckets"
import { minVariantPrice, totalVariantStock } from "@/lib/product-metrics"

/**
 * La clé de facette d'un **Produit sans Structure** (ADR-0029) : un Produit dont
 * la Structure a été supprimée reste vendable, donc indexable, et doit donc
 * rester trouvable.
 *
 * **Son premier caractère est la décision, et ce n'est pas le mot.** La
 * grammaire de slug d'une Structure est `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
 * (`slugSchema`, `lib/use-cases/admin-structure.ts`) : `_` n'y est pas
 * représentable, donc **aucune Structure ne peut porter cette valeur, jamais**.
 * C'est ce qui sépare cette constante des deux sentinelles qu'elle remplace.
 *
 * - Une **chaîne vide** ne filtre rien : `parseSearchParams` fait `if
 *   (categorySlug)` et la laisse tomber, donc la puce s'afficherait cliquable
 *   et inerte. Une facette qui ne filtre pas est une facette fausse.
 * - Un **slug ordinaire** — `sans-structure` — est collisionnable dès la
 *   prochaine Structure créée par un éditeur, et mélangerait alors deux
 *   populations dans une répartition sans qu'aucune suite ne rougisse.
 *
 * La comparaison de cette valeur se fait à raison exacte des deux côtés de la
 * couture : c'est un `string` ordinaire des deux côtés, jamais une constante
 * importée d'un module `"use client"` à travers une frontière asynchrone —
 * le piège que `parseCategoryFormData` documente déjà.
 */
export const SLUG_SANS_STRUCTURE = "_sans-structure"

/** Le libellé que la Recherche affiche pour cette valeur de facette. */
export const LIBELLE_SANS_STRUCTURE = "Sans Structure"

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
  /** Le fait : `null` pour un Produit sans Structure. */
  categoryId: string | null
  /**
   * La clé de facette : **jamais** nulle. Un Produit sans Structure y porte
   * `SLUG_SANS_STRUCTURE`, pour rester trouvable et filtrable. Aucun moteur de
   * recherche ne reçoit `categoryId` — ils ne reçoivent que celle-ci.
   */
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
  category: { id: string; slug: string; name: string } | null
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
    categoryId: product.category?.id ?? null,
    categorySlug: product.category?.slug ?? SLUG_SANS_STRUCTURE,
    categoryName: product.category?.name ?? LIBELLE_SANS_STRUCTURE,
    specsText: specsToText(product.specs),
    variantNames: product.variants.map((variant) => variant.name),
    skus: product.variants.map((variant) => variant.sku),
    isFeatured: product.isFeatured,
    freeShipping: product.freeShipping,
    priceBucket: priceBucketIdFor(minPrice),
    updatedAt: product.updatedAt.getTime(),
  }
}
