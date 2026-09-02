import { cacheLife, cacheTag } from "next/cache"

import { prisma } from "@/lib/db"
import {
  minVariantPrice,
  prixVariante,
  totalVariantStock,
} from "@/lib/product-metrics"
import {
  CATEGORY_TAG,
  HOME_TAG,
  PRODUCT_TAG,
  productDetailTag,
} from "@/lib/use-cases/cache-invalidation"

export interface CategoryNode {
  id: string
  name: string
  slug: string
  image: string | null
  productCount: number
  children: CategoryNode[]
}

export interface ProductCard {
  id: string
  name: string
  slug: string
  brand: string
  image: string | null
  minPrice: number
  totalStock: number
  freeShipping: boolean
}

export interface CategoryChainEntry {
  name: string
  slug: string
}

export interface HomeData {
  categories: CategoryNode[]
  featured: ProductCard[]
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
  products: ProductCard[]
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
  images: string[]
  minPrice: number
  freeShipping: boolean
  category: { id: string; name: string; slug: string }
  categoryChain: CategoryChainEntry[]
  variants: ProductVariantDto[]
  related: ProductCard[]
}

type CategoryWithCount = {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
  _count: { products: number }
}

export function buildCategoryTree(
  categories: CategoryWithCount[]
): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>()
  for (const category of categories) {
    nodes.set(category.id, {
      id: category.id,
      name: category.name,
      slug: category.slug,
      image: category.image,
      productCount: category._count.products,
      children: [],
    })
  }
  const roots: CategoryNode[] = []
  for (const category of categories) {
    const node = nodes.get(category.id)!
    const parent = category.parentId ? nodes.get(category.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

type VariantSummary = { priceDelta: number; stock: number }

function toProductCard(product: {
  id: string
  name: string
  slug: string
  brand: string
  images: unknown
  price: number
  freeShipping: boolean
  variants: VariantSummary[]
}): ProductCard {
  const images = Array.isArray(product.images)
    ? (product.images as string[])
    : []
  const minPrice = minVariantPrice(product.price, product.variants)
  const totalStock = totalVariantStock(product.variants)
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    image: images[0] ?? null,
    minPrice,
    totalStock,
    freeShipping: product.freeShipping,
  }
}

export async function fetchHomeData(): Promise<HomeData> {
  const [categories, featured] = await Promise.all([
    prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isFeatured: true },
      include: { variants: { select: { priceDelta: true, stock: true } } },
      orderBy: [{ featuredOrder: "asc" }, { name: "asc" }],
    }),
  ])
  const tree = buildCategoryTree(categories)
  accumulateProductCounts(tree)
  return {
    categories: tree,
    featured: featured.map((product) => toProductCard(product)),
  }
}

function accumulateProductCounts(nodes: CategoryNode[]): void {
  for (const node of nodes) {
    accumulateProductCounts(node.children)
    node.productCount += node.children.reduce(
      (sum, child) => sum + child.productCount,
      0
    )
  }
}

type CategoryLink = {
  id: string
  name: string
  slug: string
  parentId: string | null
}

async function loadCategoryLinks(): Promise<Map<string, CategoryLink>> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
  })
  return new Map(categories.map((category) => [category.id, category]))
}

async function collectCategoryAndDescendantIds(
  rootId: string
): Promise<string[]> {
  const categoriesById = await loadCategoryLinks()
  const childrenByParent = new Map<string, string[]>()
  for (const category of categoriesById.values()) {
    if (!category.parentId) continue
    const siblings = childrenByParent.get(category.parentId) ?? []
    siblings.push(category.id)
    childrenByParent.set(category.parentId, siblings)
  }
  const ids = [rootId]
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const child of childrenByParent.get(current) ?? []) {
      ids.push(child)
      queue.push(child)
    }
  }
  return ids
}

export async function fetchCategoryPageData(
  slug: string
): Promise<CategoryPageData | null> {
  const category = await prisma.category.findUnique({ where: { slug } })
  if (!category) return null

  const categoryIds = await collectCategoryAndDescendantIds(category.id)
  const products = await prisma.product.findMany({
    where: { categoryId: { in: categoryIds } },
    include: { variants: { select: { priceDelta: true, stock: true } } },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  })
  const [categoryChain, children] = await Promise.all([
    getCategoryChain(category),
    prisma.category.findMany({
      where: { parentId: category.id },
      select: { id: true, name: true, slug: true, image: true },
      orderBy: { name: "asc" },
    }),
  ])
  return {
    category: {
      id: category.id,
      name: category.name,
      slug: category.slug,
      image: category.image,
    },
    categoryChain,
    children,
    products: products.map((product) => toProductCard(product)),
  }
}

async function getCategoryChain(category: {
  id: string
  name: string
  slug: string
  parentId: string | null
}): Promise<CategoryChainEntry[]> {
  const categoriesById = await loadCategoryLinks()
  const chain: CategoryChainEntry[] = []
  let current: CategoryLink | undefined = category
  while (current) {
    chain.unshift({ name: current.name, slug: current.slug })
    current = current.parentId
      ? categoriesById.get(current.parentId)
      : undefined
  }
  return chain
}

export async function fetchProductPageData(
  slug: string
): Promise<ProductDetailData | null> {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { category: true, variants: { orderBy: { createdAt: "asc" } } },
  })
  if (!product) return null

  const related = await prisma.product.findMany({
    where: { categoryId: product.categoryId, id: { not: product.id } },
    include: { variants: { select: { priceDelta: true, stock: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  })

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    description: product.description,
    specs: (product.specs as Record<string, string>) ?? {},
    images: Array.isArray(product.images) ? (product.images as string[]) : [],
    minPrice: minVariantPrice(product.price, product.variants),
    freeShipping: product.freeShipping,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    categoryChain: await getCategoryChain(product.category),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      prix: prixVariante(product.price, variant.priceDelta),
      stock: variant.stock,
    })),
    related: related.map((item) => toProductCard(item)),
  }
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
  cacheTag(CATEGORY_TAG, PRODUCT_TAG)
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
