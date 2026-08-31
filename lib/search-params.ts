import { getPriceBucket, priceBucketFilter } from "@/lib/price-buckets"

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
  if (filters.brand)
    clauses.push(`brand = "${escapeFilterValue(filters.brand)}"`)
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
