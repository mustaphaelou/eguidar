import type { Meilisearch } from "meilisearch"

import {
  projeterCarteProduit,
  type CarteProduit,
  type FaitsCarteProduit,
} from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import { getMeiliSearch, PRODUCTS_INDEX } from "@/lib/meili"
import { getPriceBucket } from "@/lib/price-buckets"
import {
  buildSearchFilter,
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

const SORT_TO_MEILI: Record<SearchSort, string[] | undefined> = {
  pertinence: undefined,
  "prix-asc": ["minPrice:asc"],
  "prix-desc": ["minPrice:desc"],
  nouveautes: ["updatedAt:desc"],
}

/**
 * Faits d'une Carte produit depuis un résultat de Recherche. Les résultats
 * demandent les huit attributs du Document d'index ; les suggestions n'en
 * demandent que six — une Suggestion de produit ne porte ni le stock total
 * ni la Livraison offerte (CONTEXT.md) — et « montrer » ne consulte jamais
 * ces deux faits : leurs valeurs de repli ne sont pas lues.
 */
function faitsDuHit(hit: IndexableProduct): FaitsCarteProduit {
  return {
    id: hit.id,
    name: hit.name,
    slug: hit.slug,
    brand: hit.brand,
    images: hit.images,
    minPrice: hit.minPrice,
    totalStock: hit.totalStock ?? 0,
    freeShipping: hit.freeShipping ?? false,
  }
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

async function meiliSearch(
  meili: Meilisearch,
  query: string,
  filters: SearchFilters,
  sort: SearchSort,
  offset: number,
  limit: number
) {
  return meili.index<IndexableProduct>(PRODUCTS_INDEX).search(query, {
    filter: buildSearchFilter(filters),
    limit,
    offset,
    sort: SORT_TO_MEILI[sort],
    attributesToRetrieve: [
      "id",
      "name",
      "slug",
      "brand",
      "images",
      "minPrice",
      "totalStock",
      "freeShipping",
    ],
  })
}

async function meiliFacetSearch(
  meili: Meilisearch,
  query: string,
  filters: SearchFilters,
  facet: SearchFacet
) {
  return meili.index<IndexableProduct>(PRODUCTS_INDEX).search(query, {
    filter: buildSearchFilter(filters, facet),
    facets: [facet],
    limit: 0,
  })
}

export async function searchProducts(
  query: string,
  filters: SearchFilters = {},
  options: SearchOptions = {}
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

  const meili = getMeiliSearch()
  if (!meili) return emptyResult

  const [initialResult, brandFacets, categoryFacets, priceFacets] =
    await Promise.all([
      meiliSearch(
        meili,
        query,
        filters,
        sort,
        (requestedPage - 1) * pageSize,
        pageSize
      ),
      meiliFacetSearch(meili, query, filters, "brand"),
      meiliFacetSearch(meili, query, filters, "categorySlug"),
      meiliFacetSearch(meili, query, filters, "priceBucket"),
    ])
  let result = initialResult

  const totalHits = result.estimatedTotalHits
  const totalPages = Math.max(1, Math.ceil(totalHits / pageSize))
  const currentPage = Math.min(requestedPage, totalPages)
  if (currentPage !== requestedPage) {
    result = await meiliSearch(
      meili,
      query,
      filters,
      sort,
      (currentPage - 1) * pageSize,
      pageSize
    )
  }

  const brandDistribution = brandFacets.facetDistribution?.brand ?? {}
  const categoryDistribution =
    categoryFacets.facetDistribution?.categorySlug ?? {}
  const priceDistribution = priceFacets.facetDistribution?.priceBucket ?? {}

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
    products: result.hits.map((hit) =>
      projeterCarteProduit(faitsDuHit(hit), { rupture: "montrer" })
    ),
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
  query: string
): Promise<SearchSuggestionsData> {
  const emptyResult: SearchSuggestionsData = { products: [], categories: [] }

  const meili = getMeiliSearch()
  if (!meili) return emptyResult

  const result = await meili
    .index<IndexableProduct>(PRODUCTS_INDEX)
    .search(query, {
      limit: SEARCH_SUGGESTION_LIMIT,
      facets: ["categorySlug"],
      attributesToRetrieve: [
        "id",
        "name",
        "slug",
        "brand",
        "images",
        "minPrice",
      ],
    })

  const categorySlugCounts = Object.entries(
    result.facetDistribution?.categorySlug ?? {}
  ).slice(0, SEARCH_SUGGESTION_CATEGORY_LIMIT)
  const categoryNames = await fetchCategoryNames(
    categorySlugCounts.map(([slug]) => slug)
  )

  return {
    products: result.hits.map((hit) =>
      versSuggestion(
        projeterCarteProduit(faitsDuHit(hit), { rupture: "montrer" })
      )
    ),
    categories: categorySlugCounts.map(([slug]) => ({
      slug,
      name: categoryNames.get(slug) ?? slug,
    })),
  }
}
