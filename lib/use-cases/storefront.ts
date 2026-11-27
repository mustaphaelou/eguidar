import { cacheLife, cacheTag } from "next/cache"

import { apparierLienAnnonce } from "@/lib/annonce-contrat"
import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import type { ImageProduitGalerie } from "@/lib/images-produit/galerie"
import {
  parametresDeSlug,
  type ParametresDeSlug,
} from "@/lib/parametre-de-repli"
import {
  minVariantPrice,
  prixVariante,
  specificationsProduit,
  totalVariantStock,
} from "@/lib/product-metrics"
import {
  ANNONCE_TAG,
  CATEGORY_TAG,
  categoryDetailTag,
  HOME_TAG,
  PRODUCT_TAG,
  productDetailTag,
} from "@/lib/use-cases/cache-invalidation"
import { lireGalerieProduit } from "@/lib/use-cases/images-produit"
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

export interface NavSubcategory {
  name: string
  slug: string
}

export interface NavCategory {
  name: string
  slug: string
  children: readonly NavSubcategory[]
  brands: readonly string[]
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

const MAX_MARQUES_NAVIGATION = 8

export async function fetchNavCategories(): Promise<NavCategory[]> {
  const [lecture, produits] = await Promise.all([
    lireStructure(),
    prisma.product.findMany({
      where: { categoryId: { not: null } },
      select: { categoryId: true, brand: true },
    }),
  ])

  const comptesParCategorie = new Map<string, Map<string, number>>()
  for (const produit of produits) {
    if (produit.categoryId === null) continue
    const marque = produit.brand.trim()
    if (!marque) continue
    let comptes = comptesParCategorie.get(produit.categoryId)
    if (!comptes) {
      comptes = new Map()
      comptesParCategorie.set(produit.categoryId, comptes)
    }
    comptes.set(marque, (comptes.get(marque) ?? 0) + 1)
  }

  return lecture.arbreAccueil().map((racine) => {
    const marquesBranche = new Map<string, number>()
    for (const id of lecture.branche(racine.id)) {
      const comptes = comptesParCategorie.get(id)
      if (!comptes) continue
      for (const [marque, count] of comptes) {
        marquesBranche.set(marque, (marquesBranche.get(marque) ?? 0) + count)
      }
    }

    const brands = [...marquesBranche.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1] || a[0].localeCompare(b[0], "fr", { sensitivity: "base" })
      )
      .slice(0, MAX_MARQUES_NAVIGATION)
      .map(([marque]) => marque)

    return {
      name: racine.name,
      slug: racine.slug,
      children: racine.children.map(({ name, slug }) => ({ name, slug })),
      brands,
    }
  })
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

  const images = await lireGalerieProduit(product.images)

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    description: product.description,
    specs: specificationsProduit(product.specs),
    images,
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

export async function fetchProductSlugs(): Promise<string[]> {
  const produits = await prisma.product.findMany({
    select: { slug: true },
    orderBy: { slug: "asc" },
  })
  return produits.map((produit) => produit.slug)
}

export async function fetchCategorySlugs(): Promise<string[]> {
  const lecture = await lireStructure()
  return lecture
    .lignesAdmin()
    .map((structure) => structure.slug)
    .sort()
}

export async function parametresDesProduits(): Promise<ParametresDeSlug[]> {
  return parametresDeSlug(await fetchProductSlugs())
}

export async function parametresDesCategories(): Promise<ParametresDeSlug[]> {
  return parametresDeSlug(await fetchCategorySlugs())
}

const STORE_CACHE_LIFE = { revalidate: 900, expire: 86400 }

const NAVIGATION_CACHE_LIFE = { revalidate: 31_536_000, expire: 31_536_000 }

export async function getHomeData(): Promise<HomeData> {
  "use cache: remote"
  cacheTag(HOME_TAG, CATEGORY_TAG, PRODUCT_TAG)
  cacheLife(STORE_CACHE_LIFE)
  return fetchHomeData()
}

export async function getNavCategories(): Promise<NavCategory[]> {
  "use cache: remote"
  cacheTag(CATEGORY_TAG, PRODUCT_TAG)
  cacheLife(NAVIGATION_CACHE_LIFE)
  return fetchNavCategories()
}

export async function getCategoryPageData(
  slug: string
): Promise<CategoryPageData | null> {
  "use cache: remote"
  cacheTag(CATEGORY_TAG, PRODUCT_TAG, categoryDetailTag(slug))
  cacheLife(STORE_CACHE_LIFE)
  return fetchCategoryPageData(slug)
}

export interface AnnonceActive {
  message: string
  lienUrl: string | null
  lienLibelle: string | null
}

export async function fetchAnnonceActive(): Promise<AnnonceActive | null> {
  const annonce = await prisma.annonce.findUnique({
    where: { id: "default" },
    select: {
      actif: true,
      message: true,
      lienUrl: true,
      lienLibelle: true,
    },
  })

  if (!annonce || !annonce.actif) return null

  const message = annonce.message.trim()
  if (message === "") return null

  const lien = apparierLienAnnonce(annonce.lienUrl, annonce.lienLibelle)

  return {
    message,
    lienUrl: lien?.url ?? null,
    lienLibelle: lien?.libelle ?? null,
  }
}

export async function getProductPageData(
  slug: string
): Promise<ProductDetailData | null> {
  "use cache: remote"
  cacheTag(PRODUCT_TAG, productDetailTag(slug), CATEGORY_TAG)
  cacheLife(STORE_CACHE_LIFE)
  return fetchProductPageData(slug)
}

export async function getAnnonceActive(): Promise<AnnonceActive | null> {
  "use cache: remote"
  cacheTag(ANNONCE_TAG)
  cacheLife(NAVIGATION_CACHE_LIFE)
  return fetchAnnonceActive()
}
