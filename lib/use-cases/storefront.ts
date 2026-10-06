import { cacheLife, cacheTag } from "next/cache"

import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import { marcheStructure, type MarcheStructure } from "@/lib/marche-structure"
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

/**
 * La lecture complète de la Structure : **une par page, et une seule** (#552).
 *
 * `fetchCategoryPageData` et `fetchProductPageData` en sont les seuls appelants,
 * et chacun n'en fait qu'un appel — à l'intérieur de l'exécution unique de sa
 * fonction `"use cache: remote"`, une marche en découle, et ses deux traversées
 * la partagent (#548). Rien ne la retient au-delà : les liens vivent dans
 * l'exécution qui les a lus et meurent avec elle — pas de `Map` de module, que la
 * documentation range parmi les causes de blocage de build dans une portée
 * cachée, pas de promesse gardée, pas d'`AsyncLocalStorage` (recherche #552,
 * §4.3). Un Produit sans Structure ne la paie pas : il n'a pas de fil d'Ariane à
 * construire (ADR-0029).
 *
 * Le compte est épinglé par `storefront.test.ts`, qui le mesure sur le client
 * Prisma : deux lectures rendent exactement la même page, donc rien d'autre ne
 * les distingue.
 */
async function loadCategoryLinks(): Promise<Map<string, CategoryLink>> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
  })
  return new Map(categories.map((category) => [category.id, category]))
}

/**
 * La Marche de la Structure, construite sur les liens que la lecture vient de
 * rendre (ADR-0030).
 *
 * **Une marche par lecture, et une seule.** Elle retient les cycles qu'*elle* a
 * signalés : deux instances diraient deux fois la même corruption — une ligne
 * par traversée au lieu d'une ligne par requête. `fetchCategoryPageData` la
 * construit donc une fois et la passe à ses deux traversées, la descendance qui
 * décide des Produits et la remontée du fil d'Ariane (#548).
 *
 * **La boutique dégrade, elle ne refuse pas.** La marche s'arrête sur toute
 * revisite et rend ce qu'elle a parcouru ; cette lecture en fait une page — une
 * chaîne qui s'arrête où elle se referme, les Produits des Structures qu'elle a
 * atteintes — et jamais une erreur. Un visiteur n'a personne à qui rendre une
 * faute, et la page qu'il attend vaut mieux qu'un refus : c'est la posture que
 * cette lecture tient déjà pour une colonne JSON abimée, et l'inverse du refus
 * qu'une mutation rend à un éditeur (ADR-0027, ADR-0030).
 *
 * Les noms entrent dans la marche parce que le journal les nomme : un
 * avertissement qui n'énumère que des `cuid` oblige à ouvrir une console de
 * base pour le lire.
 */
function marcheDesLiens(
  categoriesById: Map<string, CategoryLink>
): MarcheStructure {
  const parents = new Map<string, string | null>()
  const noms = new Map<string, string>()
  for (const [id, lien] of categoriesById) {
    parents.set(id, lien.parentId)
    noms.set(id, lien.name)
  }
  return marcheStructure({ parents, noms })
}

/**
 * Une Structure et toutes ses descendantes : la page d'une catégorie y compte
 * les Produits qu'elle affiche, ceux de ses sous-catégories comprises.
 *
 * La Marche rend exactement l'ensemble du filtre `categoryId: { in: … }` — la
 * Structure et chacune de ses descendantes, une fois — et s'arrête sur toute
 * revisite : une Structure déjà descendue ne l'est pas deux fois, donc un cycle
 * déjà en base se referme au lieu de faire croître la file sans fin (#540). La
 * page se rend avec ce qu'elle a atteint.
 */
function collectCategoryAndDescendantIds(
  rootId: string,
  marche: MarcheStructure
): string[] {
  return marche.descendance(rootId)
}

export async function fetchCategoryPageData(
  slug: string
): Promise<CategoryPageData | null> {
  const category = await prisma.category.findUnique({ where: { slug } })
  if (!category) return null

  // Les liens sont lus **une fois** pour la page, et une seule marche en
  // découle : la descendance qui décide des Produits et le fil d'Ariane
  // partagent la même lecture et le même journal — un cycle produit une ligne,
  // pas une par traversée (#548).
  const categoriesById = await loadCategoryLinks()
  const marche = marcheDesLiens(categoriesById)

  const products = await prisma.product.findMany({
    where: {
      categoryId: { in: collectCategoryAndDescendantIds(category.id, marche) },
    },
    include: { variants: { select: { priceDelta: true, stock: true } } },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  })
  const [categoryChain, children] = await Promise.all([
    getCategoryChain(category, categoriesById, marche),
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
 * Les identifiants viennent de la Marche, qui s'arrête sur **toute** revisite —
 * comme `assertAcyclicCategoryTree`, comme la boîte de suppression côté client,
 * et pour la même raison qu'elles : un cycle déjà en base, arrivé par un import
 * ou une correction manuelle, faisait remonter sans fin un rendu serveur
 * qu'aucune transaction n'a à expirer (ADR-0027, amendement de #540). Une
 * chaîne cyclique rend donc ses maillons une fois chacun, la Structure courante
 * en dernier. Le garde rejette les revisites, pas la longueur : une chaîne
 * profonde et acyclique passe entière, et aucune profondeur maximale n'est une
 * règle de ce dépôt (ADR-0030).
 *
 * Chaque identifiant se relit ensuite dans la carte des liens pour son nom et
 * son slug — sauf la Structure courante, qui se lit sur la rangée que `fetch*`
 * a déjà en main : les deux lectures ne sont pas la même requête, et une
 * Structure absente de la carte doit tout de même paraître, seule, dans son
 * propre fil d'Ariane.
 */
function getCategoryChain(
  category: { id: string; name: string; slug: string },
  categoriesById: Map<string, CategoryLink>,
  marche: MarcheStructure
): CategoryChainEntry[] {
  return marche.ancetres(category.id).map((id) => {
    // Les ancêtres ne sortent que de la carte — la marche ne remonte que des
    // liens qu'elle porte — donc seul l'identifiant de départ peut y manquer.
    const lien = id === category.id ? category : categoriesById.get(id)!
    return { name: lien.name, slug: lien.slug }
  })
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

  // Le fil d'Ariane est la seule traversée de cette page : une lecture des
  // liens, une marche, une chaîne. Un Produit sans Structure n'en a pas, et ne
  // paie donc pas la lecture (ADR-0029, #548).
  let categoryChain: CategoryChainEntry[] = []
  if (product.category) {
    const categoriesById = await loadCategoryLinks()
    categoryChain = getCategoryChain(
      product.category,
      categoriesById,
      marcheDesLiens(categoriesById)
    )
  }

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
