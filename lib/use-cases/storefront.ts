import { cacheLife, cacheTag } from "next/cache"

import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import {
  normaliserTexteAlternatif,
  type ImageProduitGalerie,
} from "@/lib/galerie-image-produit"
import {
  parametresDeSlug,
  type ParametresDeSlug,
} from "@/lib/parametre-de-repli"
import {
  minVariantPrice,
  prixVariante,
  specificationsProduit,
  totalVariantStock,
  urlsImagesProduit,
} from "@/lib/product-metrics"
import {
  CATEGORY_TAG,
  categoryDetailTag,
  HOME_TAG,
  PRODUCT_TAG,
  productDetailTag,
} from "@/lib/use-cases/cache-invalidation"
import {
  lireStructure,
  type NoeudAccueil,
} from "@/lib/use-cases/lecture-structure"

export interface CategoryChainEntry {
  name: string
  slug: string
}

export interface HomeData {
  categories: NoeudAccueil[]
  featured: CarteProduit[]
}

export interface CategoryPageData {
  category: {
    id: string
    name: string
    slug: string
    image: string | null
  }
  categoryChain: CategoryChainEntry[]
  children: { id: string; name: string; slug: string; image: string | null }[]
  products: CarteProduit[]
}

export interface ProductVariantDto {
  id: string
  name: string
  sku: string
  prix: number
  stock: number
}

export interface ProductDetailData {
  id: string
  name: string
  slug: string
  brand: string
  description: string
  specs: Record<string, string>
  images: ImageProduitGalerie[]
  minPrice: number
  freeShipping: boolean
  category: { id: string; name: string; slug: string } | null
  categoryChain: CategoryChainEntry[]
  variants: ProductVariantDto[]
  related: CarteProduit[]
}

type VariantSummary = { priceDelta: number; stock: number }

function versCarteProduit(product: {
  id: string
  name: string
  slug: string
  brand: string
  images: unknown
  price: number
  freeShipping: boolean
  variants: VariantSummary[]
}): CarteProduit {
  return projeterCarteProduit(
    {
      id: product.id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      images: product.images,
      minPrice: minVariantPrice(product.price, product.variants),
      totalStock: totalVariantStock(product.variants),
      freeShipping: product.freeShipping,
    },
    { rupture: "montrer" }
  )
}

export async function fetchHomeData(): Promise<HomeData> {
  const [lecture, featured] = await Promise.all([
    lireStructure(),
    prisma.product.findMany({
      where: { isFeatured: true },
      include: { variants: { select: { priceDelta: true, stock: true } } },
      orderBy: [{ featuredOrder: "asc" }, { name: "asc" }],
    }),
  ])
  return {
    categories: lecture.arbreAccueil(),
    featured: featured.map((product) => versCarteProduit(product)),
  }
}

export async function fetchCategoryPageData(
  slug: string
): Promise<CategoryPageData | null> {
  const lecture = await lireStructure()
  const categorie = lecture.structureParSlug(slug)
  if (!categorie) return null

  const produits = await prisma.product.findMany({
    where: { categoryId: { in: lecture.branche(categorie.id) } },
    include: { variants: { select: { priceDelta: true, stock: true } } },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  })
  return {
    category: categorie,
    categoryChain: lecture.filAriane(categorie.id),
    children: lecture.enfants(categorie.id),
    products: produits.map((product) => versCarteProduit(product)),
  }
}

export async function fetchProductPageData(
  slug: string
): Promise<ProductDetailData | null> {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { category: true, variants: { orderBy: { createdAt: "asc" } } },
  })
  if (!product) return null

  const related = product.categoryId
    ? await prisma.product.findMany({
        where: { categoryId: product.categoryId, id: { not: product.id } },
        include: { variants: { select: { priceDelta: true, stock: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : []

  const categoryChain: CategoryChainEntry[] = product.category
    ? (await lireStructure()).filAriane(product.category.id)
    : []

  const urls = urlsImagesProduit(product.images)
  const registre =
    urls.length > 0
      ? await prisma.imageProduit.findMany({
          where: { publicUrl: { in: urls } },
          select: { publicUrl: true, alt: true },
        })
      : []
  const altParUrl = new Map(
    registre.map((ligne) => [ligne.publicUrl, ligne.alt])
  )

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    description: product.description,
    specs: specificationsProduit(product.specs),
    images: urls.map((url) => ({
      url,
      alt: normaliserTexteAlternatif(altParUrl.get(url)),
    })),
    minPrice: minVariantPrice(product.price, product.variants),
    freeShipping: product.freeShipping,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
      : null,
    categoryChain,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      prix: prixVariante(product.price, variant.priceDelta),
      stock: variant.stock,
    })),
    related: related.map((item) => versCarteProduit(item)),
  }
}

/**
 * Les slugs que le build prérend, lus dans le Catalogue. Triés pour que deux
 * builds du même Catalogue produisent la même liste.
 */
export async function fetchProductSlugs(): Promise<string[]> {
  const produits = await prisma.product.findMany({
    select: { slug: true },
    orderBy: { slug: "asc" },
  })
  return produits.map((produit) => produit.slug)
}

// La Lecture possède les lectures de la Structure (ADR-0030) ; ses lignes
// d'Administration portent toutes les rangées, hors arbre comprises, et c'est
// exactement l'ensemble des slugs que la page de catégorie sait résoudre.
export async function fetchCategorySlugs(): Promise<string[]> {
  const lecture = await lireStructure()
  return lecture
    .lignesAdmin()
    .map((structure) => structure.slug)
    .sort()
}

// Les paramètres que les routes du catalogue rendent à `generateStaticParams`.
// Un Catalogue vide donne le slug de repli : le build passe, et la page de ce
// slug traite la route comme inconnue.
export async function parametresDesProduits(): Promise<ParametresDeSlug[]> {
  return parametresDeSlug(await fetchProductSlugs())
}

export async function parametresDesCategories(): Promise<ParametresDeSlug[]> {
  return parametresDeSlug(await fetchCategorySlugs())
}

const STORE_CACHE_LIFE = { revalidate: 900, expire: 86400 }

export async function getHomeData(): Promise<HomeData> {
  "use cache: remote"
  cacheTag(HOME_TAG, CATEGORY_TAG, PRODUCT_TAG)
  cacheLife(STORE_CACHE_LIFE)
  return fetchHomeData()
}

export async function getCategoryPageData(
  slug: string
): Promise<CategoryPageData | null> {
  "use cache: remote"
  cacheTag(CATEGORY_TAG, PRODUCT_TAG, categoryDetailTag(slug))
  cacheLife(STORE_CACHE_LIFE)
  return fetchCategoryPageData(slug)
}

export async function getProductPageData(
  slug: string
): Promise<ProductDetailData | null> {
  "use cache: remote"
  cacheTag(PRODUCT_TAG, productDetailTag(slug), CATEGORY_TAG)
  cacheLife(STORE_CACHE_LIFE)
  return fetchProductPageData(slug)
}
