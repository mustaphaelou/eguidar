import { cacheLife, cacheTag } from "next/cache"

import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import {
  marcheDesStructures,
  type MarcheStructure,
} from "@/lib/marche-structure"
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

  // **La traversée appartient à la Marche de la Structure** (#551, ADR-0030).
  // L'arbre d'accueil descend depuis les racines : une Structure qu'aucune
  // racine n'atteint — un cycle, ou la branche qu'un cycle soustrait à l'arbre
  // — n'a pas de place ici, et n'en a jamais eu. Ce qui change est qu'elle est
  // désormais **nommée** : `horsArbre()` journalise le cycle, une fois pour
  // tout l'arbre, au lieu de l'effacer en silence. La boutique dégrade et rend
  // sa page ; elle ne refuse pas — c'est la mutation qui refuse, et elle seule
  // a un éditeur à qui rendre une faute (ADR-0030).
  const marche = marcheDesStructures(categories)
  const horsArbre = new Set(marche.horsArbre())

  const roots: CategoryNode[] = []
  for (const category of categories) {
    if (horsArbre.has(category.id)) continue
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
 * La lecture complète de la Structure : **une par exécution, et une seule**
 * (#552).
 *
 * `fetchCategoryPageData` et `fetchProductPageData` en sont les seuls appelants,
 * et chacun n'en fait qu'un appel — à l'intérieur de l'exécution unique de sa
 * fonction `"use cache: remote"`, une marche en découle, et ses deux traversées
 * la partagent (#548). Rien ne la retient au-delà : les liens vivent dans
 * l'exécution qui les a lus et meurent avec elle — pas de `Map` de module, que
 * la documentation range parmi les causes de blocage de build dans une portée
 * cachée, « retrieving them from shared storage (Maps) »
 * (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md:697`),
 * pas de promesse gardée, pas d'`AsyncLocalStorage`. Un Produit sans Structure
 * ne la paie pas : il n'a pas de fil d'Ariane à construire (ADR-0029).
 *
 * **Le compte est épinglé par exécution, pas par requête, et il faut le dire.**
 * `storefront.test.ts` le mesure sur le client Prisma : deux lectures rendent
 * exactement la même page, donc rien d'autre ne les distingue — et la mesure ne
 * voit qu'**une exécution**. Or les deux pages de la boutique appellent chacune
 * leur lecture deux fois, une dans `generateMetadata` et une dans le corps de
 * la page : `app/(boutique)/categorie/[slug]/page.tsx` pour
 * `getCategoryPageData(slug)`, et la page Produit pour
 * `getProductPageData(slug)` — son chemin n'est pas écrit ici, parce que
 * `lib/carte-produit-frontiere.test.ts` n'admet le segment de route que dans
 * `lib/carte-produit.ts` (ADR-0022). Ce n'est pas une duplication de
 * l'application : les deux appels traversent **la même** entrée
 * `"use cache: remote"`, et la documentation tranche — « The first call with a
 * given set of inputs runs the function body and stores its output. Every later
 * call with the same inputs reuses that output, within a render pass and across
 * requests, for as long as the entry lasts. »
 * (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md:111`).
 * Le corps — donc la lecture complète — tourne une fois par requête, sur un
 * défaut de cache.
 *
 * Ce que la suite ne peut pas faire, et ne fait pas : appeler deux fois le
 * getter caché pour compter. `test/setup.ts` substitue `next/cache`, et
 * `"use cache"` est une transformation du compilateur Next, pas un
 * comportement de `vitest` : une telle épreuve mesurerait le substitut, pas le
 * cache. La mesure reste donc sur le client Prisma, à l'intérieur d'une
 * exécution.
 */
async function loadCategoryLinks(): Promise<Map<string, CategoryLink>> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
  })
  return new Map(categories.map((category) => [category.id, category]))
}

export async function fetchCategoryPageData(
  slug: string
): Promise<CategoryPageData | null> {
  const category = await prisma.category.findUnique({ where: { slug } })
  if (!category) return null

  // Les liens sont lus **une fois** pour la page, et une seule marche en
  // découle : la descendance qui décide des Produits et le fil d'Ariane
  // partagent la même lecture et le même journal — un cycle produit une ligne,
  // pas une par traversée (#548). Les noms entrent dans la marche parce que le
  // journal les nomme : un avertissement qui n'énumère que des `cuid` oblige à
  // ouvrir une console de base pour le lire.
  const categoriesById = await loadCategoryLinks()
  const marche = marcheDesStructures([...categoriesById.values()])

  // La Marche rend exactement l'ensemble du filtre `categoryId: { in: … }` — la
  // Structure et chacune de ses descendantes, une fois — et s'arrête sur toute
  // revisite : une Structure déjà descendue ne l'est pas deux fois, donc un
  // cycle déjà en base se referme au lieu de faire croître la file sans fin
  // (#540). La page compte les Produits de ce qu'elle a atteint, sous-catégories
  // comprises, et se rend avec.
  const products = await prisma.product.findMany({
    where: { categoryId: { in: marche.descendance(category.id) } },
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
    // La carte est la lecture complète de la table, et la clé étrangère
    // garantit qu'une parente nommée existe : tout ancêtre y est donc, et seul
    // l'identifiant de départ peut manquer — la rangée de `fetch*` et la carte
    // ne viennent pas de la même requête (`LiensStructure`).
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
      marcheDesStructures([...categoriesById.values()])
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
