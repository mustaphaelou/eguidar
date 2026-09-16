import { prisma } from "@/lib/db"
import { moteurMeili } from "@/lib/meili"
import { retirerFacette, type MoteurRecherche } from "@/lib/moteur-recherche"
import { getPriceBucket } from "@/lib/price-buckets"
import {
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_DEFAULT,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"

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

// `retirerFacette` reste la propriété publique de la Recherche (ADR-0016).
export { retirerFacette }

export interface SearchProductCard {
  id: string
  name: string
  slug: string
  brand: string
  image: string | null
  minPrice: number
  totalStock: number
  freeShipping: boolean
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
  products: SearchProductCard[]
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

  const [initialResult, brandFacets, categoryFacets, priceFacets] =
    await Promise.all([
      moteur.chercher({
        query,
        filtres: filters,
        tri: sort,
        page: requestedPage,
        taille: pageSize,
      }),
      moteur.chercher({
        query,
        filtres: retirerFacette(filters, "brand"),
        tri: sort,
        taille: 0,
        facettes: ["brand"],
      }),
      moteur.chercher({
        query,
        filtres: retirerFacette(filters, "categorySlug"),
        tri: sort,
        taille: 0,
        facettes: ["categorySlug"],
      }),
      moteur.chercher({
        query,
        filtres: retirerFacette(filters, "priceBucket"),
        tri: sort,
        taille: 0,
        facettes: ["priceBucket"],
      }),
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
    products: documents.map((hit) => ({
      id: hit.id,
      name: hit.name,
      slug: hit.slug,
      brand: hit.brand,
      image: hit.images[0] ?? null,
      minPrice: hit.minPrice,
      totalStock: hit.totalStock,
      freeShipping: hit.freeShipping,
    })),
    facets: { brands, categories, priceBuckets },
    sort,
    currentPage,
    totalPages,
    pageSize,
  }
}

export interface SearchSuggestionProduct {
  id: string
  name: string
  slug: string
  brand: string
  image: string | null
  minPrice: number
}

export interface SearchSuggestionCategory {
  slug: string
  name: string
}

export interface SearchSuggestionsData {
  products: SearchSuggestionProduct[]
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
    products: reponse.documents.map((hit) => ({
      id: hit.id,
      name: hit.name,
      slug: hit.slug,
      brand: hit.brand,
      image: hit.images[0] ?? null,
      minPrice: hit.minPrice,
    })),
    categories: categorySlugCounts.map(([slug]) => ({
      slug,
      name: categoryNames.get(slug) ?? slug,
    })),
  }
}
