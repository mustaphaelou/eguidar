import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import { moteurMeili } from "@/lib/meili"
import { retirerFacette, type MoteurRecherche } from "@/lib/moteur-recherche"
import { getPriceBucket } from "@/lib/price-buckets"
import {
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_DEFAULT,
  type SearchFacet,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"
import type { IndexableProduct } from "@/lib/index-projection"

export {
  buildSearchFilter,
  buildSearchHref,
  escapeFilterValue,
  parsePage,
  parseSearchParams,
  parseSort,
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_DEFAULT,
  SEARCH_SORT_OPTIONS,
  toggleBrand,
  type ParsedSearchParams,
  type SearchFacet,
  type SearchFilters,
  type SearchSort,
  type SearchView,
} from "@/lib/search-params"

// `retirerFacette` reste la propriété publique de la Recherche (ADR-0016) :
// le retrait se fait ici, une seule fois, avant que les filtres ne descendent
// vers un moteur — un moteur applique exactement les filtres qu'il reçoit.
export { retirerFacette }

/**
 * Carte produit d'un résultat de Recherche : les résultats demandent les huit
 * attributs du Document d'index, donc les deux métriques arrivent cuites et
 * sont passées telles quelles — la projection sous « montrer » les exige.
 */
function carteDuHit(hit: IndexableProduct): CarteProduit {
  return projeterCarteProduit(
    {
      id: hit.id,
      name: hit.name,
      slug: hit.slug,
      brand: hit.brand,
      images: hit.images,
      minPrice: hit.minPrice,
      totalStock: hit.totalStock,
      freeShipping: hit.freeShipping,
    },
    { rupture: "montrer" }
  )
}

export interface SearchFacetValue {
  value: string
  count: number
}

export interface SearchCategoryFacet extends SearchFacetValue {
  name: string
}

export interface SearchPriceBucketFacet {
  id: string
  label: string
  count: number
}

export interface SearchPageData {
  query: string
  totalHits: number
  products: CarteProduit[]
  facets: {
    brands: SearchFacetValue[]
    categories: SearchCategoryFacet[]
    priceBuckets: SearchPriceBucketFacet[]
  }
  sort: SearchSort
  currentPage: number
  totalPages: number
  pageSize: number
}

export interface SearchOptions {
  sort?: SearchSort
  page?: number
  pageSize?: number
}

async function fetchCategoryNames(
  slugs: string[]
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map()
  const categories = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true },
  })
  return new Map(categories.map((category) => [category.slug, category.name]))
}

export async function searchProducts(
  query: string,
  filters: SearchFilters = {},
  options: SearchOptions = {},
  moteur: MoteurRecherche = moteurMeili()
): Promise<SearchPageData> {
  const sort = options.sort ?? SEARCH_SORT_DEFAULT
  const pageSize = options.pageSize ?? SEARCH_PAGE_SIZE
  const requestedPage = options.page ?? 1

  const emptyResult: SearchPageData = {
    query,
    totalHits: 0,
    products: [],
    facets: { brands: [], categories: [], priceBuckets: [] },
    sort,
    currentPage: 1,
    totalPages: 1,
    pageSize,
  }

  // La requête de décompte d'une facette (ADR-0016) : `taille: 0`, les
  // filtres reçus moins la clause de la facette comptée, et rien d'autre à
  // retirer en chemin — chaque moteur applique exactement ce qu'il reçoit.
  const requeteDeFacette = (facette: SearchFacet) =>
    moteur.chercher({
      query,
      filtres: retirerFacette(filters, facette),
      tri: sort,
      taille: 0,
      facettes: [facette],
    })

  const [initialResult, brandFacets, categoryFacets, priceFacets] =
    await Promise.all([
      moteur.chercher({
        query,
        filtres: filters,
        tri: sort,
        page: requestedPage,
        taille: pageSize,
      }),
      requeteDeFacette("brand"),
      requeteDeFacette("categorySlug"),
      requeteDeFacette("priceBucket"),
    ])

  // Un moteur absent ou injoignable rend l'écran d'aujourd'hui : le Catalogue
  // vide, sans bornage de page — il n'y a aucun total à border, et aucune
  // requête de plus à lui demander.
  if (
    initialResult.statut === "indisponible" ||
    brandFacets.statut === "indisponible" ||
    categoryFacets.statut === "indisponible" ||
    priceFacets.statut === "indisponible"
  ) {
    return emptyResult
  }

  const totalHits = initialResult.total
  const totalPages = Math.max(1, Math.ceil(totalHits / pageSize))
  const currentPage = Math.min(requestedPage, totalPages)
  let documents = initialResult.documents
  if (currentPage !== requestedPage) {
    const clampedResult = await moteur.chercher({
      query,
      filtres: filters,
      tri: sort,
      page: currentPage,
      taille: pageSize,
    })
    // Le moteur s'est tu entre les deux vagues : même Catalogue vide.
    if (clampedResult.statut === "indisponible") return emptyResult
    documents = clampedResult.documents
  }

  const brandDistribution = brandFacets.repartitions.brand ?? {}
  const categoryDistribution = categoryFacets.repartitions.categorySlug ?? {}
  const priceDistribution = priceFacets.repartitions.priceBucket ?? {}

  const brands: SearchFacetValue[] = Object.entries(brandDistribution)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "fr"))

  const categoryCounts = new Map(Object.entries(categoryDistribution))
  if (filters.categorySlug && !categoryCounts.has(filters.categorySlug)) {
    categoryCounts.set(filters.categorySlug, 0)
  }
  const categoryNames = await fetchCategoryNames([...categoryCounts.keys()])
  const categories: SearchCategoryFacet[] = [...categoryCounts.entries()]
    .map(([value, count]) => ({
      value,
      name: categoryNames.get(value) ?? value,
      count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))

  const priceBuckets: SearchPriceBucketFacet[] = Object.entries(
    priceDistribution
  )
    .flatMap(([id, count]) => {
      const bucket = getPriceBucket(id)
      return bucket ? [{ id, label: bucket.label, count }] : []
    })
    .sort(
      (a, b) =>
        (getPriceBucket(a.id)?.minCents ?? 0) -
        (getPriceBucket(b.id)?.minCents ?? 0)
    )

  return {
    query,
    totalHits,
    products: documents.map(carteDuHit),
    facets: { brands, categories, priceBuckets },
    sort,
    currentPage,
    totalPages,
    pageSize,
  }
}

/**
 * Suggestion de produit : la ligne compacte que la Recherche propose dans
 * le header (CONTEXT.md) — les six faits de sa rangée, projetés depuis la
 * Carte produit. Déclarée ici, une seule fois : le composant client
 * l'importe (`import type`).
 */
export interface SuggestionProduit {
  id: string
  name: string
  slug: string
  brand: string
  image: string | null
  minPrice: number
}

/**
 * Réduit une Carte produit aux six faits de la rangée de suggestion : ni
 * le stock total ni la Livraison offerte n'y figurent.
 */
function versSuggestion(carte: CarteProduit): SuggestionProduit {
  return {
    id: carte.id,
    name: carte.name,
    slug: carte.slug,
    brand: carte.brand,
    image: carte.image,
    minPrice: carte.minPrice,
  }
}

/**
 * Suggestion de produit depuis un résultat de Recherche : la requête ne
 * demande que les six attributs de la rangée, donc six faits sont projetés —
 * aucune valeur de repli n'est inventée. La projection est appelée sous
 * « masquer » avec un stock total absent, c'est-à-dire inconnu : elle ne
 * retire alors jamais la ligne.
 */
function suggestionsDuHit(hit: IndexableProduct): SuggestionProduit[] {
  const carte = projeterCarteProduit(
    {
      id: hit.id,
      name: hit.name,
      slug: hit.slug,
      brand: hit.brand,
      images: hit.images,
      minPrice: hit.minPrice,
    },
    { rupture: "masquer" }
  )
  return carte ? [versSuggestion(carte)] : []
}

export interface SearchSuggestionCategory {
  slug: string
  name: string
}

export interface SearchSuggestionsData {
  products: SuggestionProduit[]
  categories: SearchSuggestionCategory[]
}

const SEARCH_SUGGESTION_LIMIT = 6
const SEARCH_SUGGESTION_CATEGORY_LIMIT = 5

export async function searchSuggestions(
  query: string,
  moteur: MoteurRecherche = moteurMeili()
): Promise<SearchSuggestionsData> {
  const emptyResult: SearchSuggestionsData = { products: [], categories: [] }

  const reponse = await moteur.chercher({
    query,
    taille: SEARCH_SUGGESTION_LIMIT,
    facettes: ["categorySlug"],
  })

  // Un moteur absent ou injoignable : les deux listes vides d'aujourd'hui.
  if (reponse.statut === "indisponible") return emptyResult

  const categorySlugCounts = Object.entries(
    reponse.repartitions.categorySlug ?? {}
  ).slice(0, SEARCH_SUGGESTION_CATEGORY_LIMIT)
  const categoryNames = await fetchCategoryNames(
    categorySlugCounts.map(([slug]) => slug)
  )

  return {
    products: reponse.documents.flatMap(suggestionsDuHit),
    categories: categorySlugCounts.map(([slug]) => ({
      slug,
      name: categoryNames.get(slug) ?? slug,
    })),
  }
}
