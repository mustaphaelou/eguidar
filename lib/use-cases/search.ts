import type { Meilisearch } from "meilisearch"

import { prisma } from "@/lib/db"
import { getMeiliSearch, PRODUCTS_INDEX } from "@/lib/meili"
import { getPriceBucket, priceBucketFilter } from "@/lib/price-buckets"
import type { IndexableProduct } from "@/lib/index-projection"

export interface SearchFilters {
  brand?: string
  categorySlug?: string
  priceBucketId?: string
}

export type SearchSort = "pertinence" | "prix-asc" | "prix-desc" | "nouveautes"

export const SEARCH_PAGE_SIZE = 24

export const SEARCH_SORT_DEFAULT: SearchSort = "pertinence"

export const SEARCH_SORT_OPTIONS: { id: SearchSort; label: string }[] = [
  { id: "pertinence", label: "Pertinence" },
  { id: "prix-asc", label: "Prix croissant" },
  { id: "prix-desc", label: "Prix décroissant" },
  { id: "nouveautes", label: "Nouveautés" },
]

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

export function parseSort(value: string | undefined): SearchSort {
  return SEARCH_SORT_OPTIONS.some((option) => option.id === value)
    ? (value as SearchSort)
    : SEARCH_SORT_DEFAULT
}

export function parsePage(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function buildSearchFilter(filters: SearchFilters): string | undefined {
  const clauses: string[] = []
  if (filters.brand) clauses.push(`brand = "${escapeFilterValue(filters.brand)}"`)
  if (filters.categorySlug) {
    clauses.push(`categorySlug = "${escapeFilterValue(filters.categorySlug)}"`)
  }
  const bucket = getPriceBucket(filters.priceBucketId)
  if (bucket) clauses.push(`(${priceBucketFilter(bucket)})`)
  return clauses.length > 0 ? clauses.join(" AND ") : undefined
}

export interface ParsedSearchParams {
  query: string
  filters: SearchFilters
  sort: SearchSort
  page: number
}

export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
  defaultSort: SearchSort = SEARCH_SORT_DEFAULT
): ParsedSearchParams {
  const first = (key: string): string | undefined => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const query = first("q")?.trim() ?? ""
  const filters: SearchFilters = {}

  const brand = first("marque")?.trim()
  if (brand) filters.brand = brand

  const categorySlug = first("categorie")?.trim()
  if (categorySlug) filters.categorySlug = categorySlug

  const priceBucketId = first("prix")?.trim()
  if (getPriceBucket(priceBucketId)) filters.priceBucketId = priceBucketId

  const rawSort = first("tri")
  const sort = rawSort === undefined ? defaultSort : parseSort(rawSort)

  return { query, filters, sort, page: parsePage(first("page")) }
}

export interface SearchView {
  sort?: SearchSort
  page?: number
}

export function buildSearchHref(
  query: string,
  filters: SearchFilters,
  overrides: Partial<SearchFilters> = {},
  view: SearchView = {},
  path: string = "/recherche"
): string {
  const next: SearchFilters = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  if (next.brand) params.set("marque", next.brand)
  if (next.categorySlug) params.set("categorie", next.categorySlug)
  if (next.priceBucketId) params.set("prix", next.priceBucketId)
  const sort = view.sort ?? SEARCH_SORT_DEFAULT
  if (sort !== SEARCH_SORT_DEFAULT) params.set("tri", sort)
  const page = view.page ?? 1
  if (page > 1) params.set("page", String(page))
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

const FACET_ATTRIBUTES = ["brand", "categorySlug", "priceBucket"]

async function fetchCategoryNames(slugs: string[]): Promise<Map<string, string>> {
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
  const categoryNames = await fetchCategoryNames(categorySlugCounts.map(([slug]) => slug))
  const categories: SearchCategoryFacet[] = categorySlugCounts
    .map(([value, count]) => ({ value, name: categoryNames.get(value) ?? value, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))

  const priceBuckets: SearchPriceBucketFacet[] = Object.entries(distribution.priceBucket ?? {})
    .flatMap(([id, count]) => {
      const bucket = getPriceBucket(id)
      return bucket ? [{ id, label: bucket.label, count }] : []
    })
    .sort((a, b) => (getPriceBucket(a.id)?.minCents ?? 0) - (getPriceBucket(b.id)?.minCents ?? 0))

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

export async function searchSuggestions(query: string): Promise<SearchSuggestionsData> {
  const emptyResult: SearchSuggestionsData = { products: [], categories: [] }

  const meili = getMeiliSearch()
  if (!meili) return emptyResult

  const result = await meili.index<IndexableProduct>(PRODUCTS_INDEX).search(query, {
    limit: SEARCH_SUGGESTION_LIMIT,
    facets: ["categorySlug"],
    attributesToRetrieve: ["id", "name", "slug", "brand", "images", "minPrice"],
  })

  const categorySlugCounts = Object.entries(
    result.facetDistribution?.categorySlug ?? {}
  ).slice(0, SEARCH_SUGGESTION_CATEGORY_LIMIT)
  const categoryNames = await fetchCategoryNames(categorySlugCounts.map(([slug]) => slug))

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
