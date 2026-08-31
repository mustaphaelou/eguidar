import type { Meilisearch } from "meilisearch"

import { prisma } from "@/lib/db"
import { getMeiliSearch, PRODUCTS_INDEX } from "@/lib/meili"
import { getPriceBucket } from "@/lib/price-buckets"
import {
  buildSearchFilter,
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_DEFAULT,
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
  type ParsedSearchParams,
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

const FACET_ATTRIBUTES = ["brand", "categorySlug", "priceBucket"]

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
    facets: FACET_ATTRIBUTES,
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

  let result = await meiliSearch(
    meili,
    query,
    filters,
    sort,
    (requestedPage - 1) * pageSize,
    pageSize
  )

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

  const distribution = result.facetDistribution ?? {}

  const brands: SearchFacetValue[] = Object.entries(distribution.brand ?? {})
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "fr"))

  const categorySlugCounts = Object.entries(distribution.categorySlug ?? {})
  const categoryNames = await fetchCategoryNames(
    categorySlugCounts.map(([slug]) => slug)
  )
  const categories: SearchCategoryFacet[] = categorySlugCounts
    .map(([value, count]) => ({
      value,
      name: categoryNames.get(value) ?? value,
      count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))

  const priceBuckets: SearchPriceBucketFacet[] = Object.entries(
    distribution.priceBucket ?? {}
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
    products: result.hits.map((hit) => ({
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
    products: result.hits.map((hit) => ({
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
