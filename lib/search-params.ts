import { lireFiltres, parametresDeFiltre } from "@/lib/filtre-de-recherche"

export type SearchFacet = "brand" | "categorySlug" | "priceBucket"

export interface SearchFilters {
  brand?: string[]
  categorySlug?: string
  priceBucketId?: string
}

export type SearchSort = "pertinence" | "prix-asc" | "prix-desc" | "nouveautes"

export const SEARCH_PAGE_SIZE = 24

export const SEARCH_QUERY_MAX_LENGTH = 200

export const SEARCH_QUERY_MIN_LENGTH = 2

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

  const query = (first("q")?.trim() ?? "").slice(0, SEARCH_QUERY_MAX_LENGTH)

  const rawSort = first("tri")
  const sort = rawSort === undefined ? defaultSort : parseSort(rawSort)

  return {
    query,
    filters: lireFiltres(params),
    sort,
    page: parsePage(first("page")),
  }
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
  for (const [cle, valeur] of parametresDeFiltre(next)) {
    params.append(cle, valeur)
  }
  const sort = view.sort ?? SEARCH_SORT_DEFAULT
  if (sort !== SEARCH_SORT_DEFAULT) params.set("tri", sort)
  const page = view.page ?? 1
  if (page > 1) params.set("page", String(page))
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}
