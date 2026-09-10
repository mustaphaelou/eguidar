import { getPriceBucket, priceBucketFilter } from "@/lib/price-buckets"

export type SearchFacet = "brand" | "categorySlug" | "priceBucket"

export interface SearchFilters {
  brand?: string[]
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

function parseBrands(value: string | string[] | undefined): string[] {
  const values =
    value === undefined ? [] : Array.isArray(value) ? value : [value]
  const brands: string[] = []
  for (const raw of values) {
    const brand = raw.trim()
    if (brand && !brands.includes(brand)) brands.push(brand)
  }
  return brands
}

export function toggleBrand(
  current: string[] | undefined,
  brand: string
): string[] {
  const brands = current ?? []
  return brands.includes(brand)
    ? brands.filter((candidate) => candidate !== brand)
    : [...brands, brand]
}

export function buildSearchFilter(
  filters: SearchFilters,
  omit?: SearchFacet
): string | undefined {
  const clauses: string[] = []

  const brands = filters.brand ?? []
  if (omit !== "brand" && brands.length > 0) {
    const values = brands
      .map((brand) => `"${escapeFilterValue(brand)}"`)
      .join(", ")
    clauses.push(`brand IN [${values}]`)
  }

  if (omit !== "categorySlug" && filters.categorySlug) {
    clauses.push(`categorySlug = "${escapeFilterValue(filters.categorySlug)}"`)
  }

  if (omit !== "priceBucket") {
    const bucket = getPriceBucket(filters.priceBucketId)
    if (bucket) clauses.push(`(${priceBucketFilter(bucket)})`)
  }

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

  const brands = parseBrands(params.marque)
  if (brands.length > 0) filters.brand = brands

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
  for (const brand of next.brand ?? []) params.append("marque", brand)
  if (next.categorySlug) params.set("categorie", next.categorySlug)
  if (next.priceBucketId) params.set("prix", next.priceBucketId)
  const sort = view.sort ?? SEARCH_SORT_DEFAULT
  if (sort !== SEARCH_SORT_DEFAULT) params.set("tri", sort)
  const page = view.page ?? 1
  if (page > 1) params.set("page", String(page))
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}
