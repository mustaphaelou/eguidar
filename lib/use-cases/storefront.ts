import { cacheLife, cacheTag } from "next/cache"

import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import {
  minVariantPrice,
  prixVariante,
  specificationsProduit,
  totalVariantStock,
  urlsImagesProduit,
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

export interface CategoryChainEntry {
  name: string
  slug: string
}

export interface HomeData {
  categories: CategoryNode[]
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
  images: string[]
  minPrice: number
  freeShipping: boolean
  /**
   * `null` pour un **Produit sans Structure** (ADR-0029). La page en dégrade son
   * fil d'Ariane plutôt que de ne pas le déduire — c'est le seul fait qu'elle
   * perde, et il n'entre dans aucune Donnée structurée.
   */
  category: { id: string; name: string; slug: string } | null
  categoryChain: CategoryChainEntry[]
  variants: ProductVariantDto[]
  related: CarteProduit[]
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

/**
 * Carte produit d'un Produit du catalogue : la projection
 * (`@/lib/carte-produit`) sur les métriques cuites par
 * `@/lib/product-metrics`. Un Produit en rupture reste affiché
 * (« montrer ») — seul le Produit lié masque (#164).
 */
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
    featured: featured.map((product) => versCarteProduit(product)),
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

/**
 * Une Structure et toutes ses descendantes : la page d'une catégorie y compte
 * les Produits qu'elle affiche, ceux de ses sous-catégories comprises.
 *
 * La marche garde les identifiants qu'elle a déjà descendus, et **toute**
 * revisite l'arrête — le même garde, et pour la même raison, que
 * `getCategoryChain` : un cycle déjà en base se referme sur lui-même ici aussi,
 * et la file grossissait à chaque tour sans qu'aucune transaction n'ait à
 * expire (#540). Elle s'arrête donc où le cycle commence, et la page se rend.
 */
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
  const vus = new Set([rootId])
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const child of childrenByParent.get(current) ?? []) {
      // Déjà descendue : la marche se referme sur elle-même. Sans ce garde,
      // un cycle déjà en base la fait boucler indéfiniment, en empilant à
      // chaque tour — le même garde que `getCategoryChain`, pour la même
      // raison (#540).
      if (vus.has(child)) continue
      vus.add(child)
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
    products: products.map((product) => versCarteProduit(product)),
  }
}

/**
 * Le fil d'Ariane d'une Structure : elle et tous ses ancêtres, la Structure
 * courante en dernier.
 *
 * La marche garde les identifiants qu'elle a visités et **toute** revisite
 * l'arrête, comme `assertAcyclicCategoryTree` et comme la boîte de suppression
 * côté client. Un cycle déjà en base — un import, une reprise, une correction
 * manuelle ; le verrou d'ADR-0027 interdit d'en former un par l'interface,
 * pas d'en recevoir un — la faisait remonter sans fin, et le rendu serveur ne
 * s'arrêtait pas : ici aucune transaction n'est à expire, donc rien ne borne
 * la boucle par ailleurs, et le `chain` croît à chaque tour (ADR-0027,
 * amendement de #540).
 *
 * **La boutique dégrade, elle ne refuse pas.** Une donnée corrompue rend des
 * faits dégradés — la chaîne s'arrête où elle se referme — et jamais une page
 * cassée : c'est la posture que cette lecture tient déjà pour une colonne JSON
 * abimée, et l'inverse du refus que la mutation rend, car personne n'a de
 * faute à qui rendre une saisie. Le garde rejette les revisites, pas la
 * longueur : une chaîne profonde et acyclique passe entière, et aucune
 * profondeur maximale n'est une règle de ce dépôt.
 */
async function getCategoryChain(category: {
  id: string
  name: string
  slug: string
  parentId: string | null
}): Promise<CategoryChainEntry[]> {
  const categoriesById = await loadCategoryLinks()
  const chain: CategoryChainEntry[] = []
  const vus = new Set<string>()
  let current: CategoryLink | undefined = category
  while (current && !vus.has(current.id)) {
    chain.unshift({ name: current.name, slug: current.slug })
    vus.add(current.id)
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

  // **Les Produits liés sont les Produits d'une même Structure, et rien
  // d'autre.** Le garde n'est pas défensif : rendu tel quel, `categoryId: null`
  // vaut « `IS NULL` » chez Prisma, donc la requête appariait *tous* les autres
  // Produits sans Structure — un voisinage muet, qu'aucune suite n'aurait rouge.
  // Un Produit sans Structure n'a donc aucun Produit lié (ADR-0029).
  const related = product.categoryId
    ? await prisma.product.findMany({
        where: { categoryId: product.categoryId, id: { not: product.id } },
        include: { variants: { select: { priceDelta: true, stock: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : []

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    description: product.description,
    specs: specificationsProduit(product.specs),
    images: urlsImagesProduit(product.images),
    minPrice: minVariantPrice(product.price, product.variants),
    freeShipping: product.freeShipping,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
      : null,
    categoryChain: product.category
      ? await getCategoryChain(product.category)
      : [],
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
