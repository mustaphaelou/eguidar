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
import {
  lireArbreAccueil,
  lireFilAriane,
  lirePageCategorie,
  type NoeudAccueil,
} from "@/lib/use-cases/lecture-structure"

export interface CategoryChainEntry {
  name: string
  slug: string
}

export interface HomeData {
  /**
   * L'arbre d'accueil vient de la Lecture de la Structure, qui en possède la
   * lecture : la page ne lit plus la table, elle ne fait que la demander.
   */
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

/**
 * L'accueil : l'arbre d'accueil vient de la Lecture de la Structure, qui lit la
 * table une fois et garantit l'ordre et le compte de Produits ; les Produits mis
 * en avant restent une lecture du Catalogue, et les deux courent de front.
 */
export async function fetchHomeData(): Promise<HomeData> {
  const [categories, featured] = await Promise.all([
    lireArbreAccueil(),
    prisma.product.findMany({
      where: { isFeatured: true },
      include: { variants: { select: { priceDelta: true, stock: true } } },
      orderBy: [{ featuredOrder: "asc" }, { name: "asc" }],
    }),
  ])
  return {
    categories,
    featured: featured.map((product) => versCarteProduit(product)),
  }
}

/**
 * La page de catégorie : sa Structure, son fil d'Ariane, ses sous-catégories et
 * l'ensemble d'identifiants qui décide de ses Produits viennent de la **Lecture
 * de la Structure**, qui en possède la lecture (#570). La page ne lit plus la
 * table : elle ne fait que la demander, et **une fois** — la rangée qu'elle
 * rendait par `findUnique({ where: { slug } })` est un fait du surensemble, donc
 * une recherche en mémoire ; c'est la seule requête que ce déplacement retire,
 * et c'est le seul gain visible de toute l'opération.
 *
 * Il ne reste donc qu'une lecture ici, celle du **Catalogue** : les Produits
 * eux-mêmes. Elle est bornée par `categoryId: { in: … }`, que la Lecture a
 * rendu — la Structure et chacune de ses descendantes, chacune une fois. La
 * borne n'est donc plus écrite par la page : elle est un fait que le module
 * promet, et une page qui la réécrirait à la main pourrait y mettre deux fois la
 * même Structure.
 *
 * Elle attend la Lecture au lieu de la courir : les deux lectures étaient
 * concurrentes avant, et elles ne le sont plus. C'est le prix d'un module qui
 * répond à toute une page d'une seule fois — et il est le même pour les autres
 * surfaces qui l'ont déjà fait (#566, #567, #568, #570, #571, #572, #576).
 */
export async function fetchCategoryPageData(
  slug: string
): Promise<CategoryPageData | null> {
  const page = await lirePageCategorie(slug)
  // Un slug que la Structure ne porte pas rend une absence, et c'est la page qui
  // en fait un `notFound()` : la Lecture dégrade, elle ne décide pas (ADR-0030).
  if (!page) return null

  const products = await prisma.product.findMany({
    where: { categoryId: { in: page.idsProduits } },
    include: { variants: { select: { priceDelta: true, stock: true } } },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  })
  return {
    category: page.categorie,
    categoryChain: page.filAriane,
    children: page.enfants,
    products: products.map((product) => versCarteProduit(product)),
  }
}

/**
 * La fiche Produit : sa rangée, ses variantes, ses Produits liés et son fil
 * d'Ariane. Le **Catalogue** se lit ici — la rangée du Produit, qui tire sa
 * Structure par une relation, et les Produits liés — et la **Structure** ne se
 * lit plus : son fil d'Ariane vient de la Lecture de la Structure (#571), qui en
 * possède la lecture. `loadCategoryLinks`, la lecture des liens, et
 * `getCategoryChain`, la marche que la boutique bâtissait par-dessus,
 * disparaissent avec ce billet : **la boutique n'atteint plus la table
 * `Category`**, et la dernière projection qui lisait la Structure par ses propres
 * moyens part avec eux.
 *
 * **Un Produit sans Structure ne paie aucune lecture de la Structure, et le
 * garde est ici, avant la porte.** Une porte de lecture lit la table entière dès
 * qu'on l'appelle : l'appeler pour un Produit qui n'a pas de Structure ferait
 * payer au cas commun — le Produit dont la Structure a été supprimée, qui est
 * **vendu normalement** (ADR-0029) — une lecture dont il n'a rien à faire. Le
 * fait que ce garde regarde est celui que la page tient déjà
 * (`product.category`, lu par la relation), et non une lecture de plus. La preuve
 * n'est donc pas une phrase : `storefront.test.ts` mesure les lectures sur le
 * client Prisma et en attend **zéro** pour un Produit sans Structure, une pour
 * un Produit qui en a une (US 25).
 *
 * **Le compte est épinglé par exécution, pas par requête, et il faut le dire.**
 * La mesure est faite sur le client Prisma : deux lectures rendent exactement la
 * même page, donc rien d'autre ne les distingue — et la mesure ne voit
 * qu'**une exécution**. La fiche Produit appelle son getter caché deux fois, une
 * dans `generateMetadata` et une dans le corps de la page, pour
 * `getProductPageData(slug)` — son chemin n'est pas écrit ici, parce que
 * `lib/carte-produit-frontiere.test.ts` n'admet le segment de route que dans
 * `lib/carte-produit.ts` (ADR-0022). Ce n'est pas une duplication de
 * l'application : les deux appels traversent **la même** entrée
 * `"use cache: remote"`, et la documentation tranche — « The first call with a
 * given set of inputs runs the function body and stores its output. Every later
 * call with the same inputs reuses that output, within a render pass and across
 * requests, for as long as the entry lasts. »
 * (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md:111`).
 * Le corps — donc la lecture de la Structure — tourne une fois par requête, sur
 * un défaut de cache.
 *
 * Ce que la suite ne peut pas faire, et ne fait pas : appeler deux fois le
 * getter caché pour compter. `test/setup.ts` substitue `next/cache`, et
 * `"use cache"` est une transformation du compilateur Next, pas un
 * comportement de `vitest` : une telle épreuve mesurerait le substitut, pas le
 * cache. La mesure reste donc sur le client Prisma, à l'intérieur d'une
 * exécution.
 *
 * **Un cycle déjà en base y donne une seule ligne**, comme partout ailleurs : la
 * fiche ne pose qu'une question à la Structure, donc elle ne bâtit qu'une
 * marche, donc la retenue qui tait un cycle — qui vit dans la marche et meurt
 * avec elle — n'a qu'une chose à dire pour toute la page. C'est le module qui
 * tient cette promesse désormais, et la page ne la réémet plus (ADR-0030, US 34).
 */
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

  // Le fil d'Ariane est la seule traversée de cette page : une lecture de la
  // Structure par la Lecture, une marche, une chaîne — et rien que la fiche
  // demande. Un Produit sans Structure n'en a pas, et ne paie donc pas la
  // lecture : le garde est **avant** l'appel, parce qu'après la porte de lecture
  // il serait déjà trop tard (ADR-0029, #548, #571). Le fil rendu est le même que
  // celui de la page de catégorie — la racine d'abord, la Structure du Produit en
  // dernier, chaque maillon une fois (US 3) — il a juste changé de maison.
  const categoryChain: CategoryChainEntry[] = product.category
    ? await lireFilAriane(product.category.id)
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
