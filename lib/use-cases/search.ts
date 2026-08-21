import { prisma } from "@/lib/db"
import { getMeiliSearch, PRODUCTS_INDEX } from "@/lib/meili"
import { getPriceBucket, priceBucketFilter } from "@/lib/price-buckets"
import type { IndexableProduct } from "@/lib/index-projection"

export interface SearchFilters {
  brand?: string
  categorySlug?: string
  priceBucketId?: string
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
}

const SEARCH_HITS_LIMIT = 48

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
}

export function parseSearchParams(
  params: Record<string, string | string[] | undefined>
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

  return { query, filters }
}

export function buildSearchHref(
  query: string,
  filters: SearchFilters,
  overrides: Partial<SearchFilters> = {}
): string {
  const next: SearchFilters = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  if (next.brand) params.set("marque", next.brand)
  if (next.categorySlug) params.set("categorie", next.categorySlug)
  if (next.priceBucketId) params.set("prix", next.priceBucketId)
  const queryString = params.toString()
  return queryString ? `/recherche?${queryString}` : "/recherche"
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

export async function searchProducts(
  query: string,
  filters: SearchFilters = {}
): Promise<SearchPageData> {
  const emptyResult: SearchPageData = {
    query,
    totalHits: 0,
    products: [],
    facets: { brands: [], categories: [], priceBuckets: [] },
  }

  const meili = getMeiliSearch()
  if (!meili) return emptyResult

  const result = await meili
    .index<IndexableProduct>(PRODUCTS_INDEX)
    .search(query, {
      filter: buildSearchFilter(filters),
      facets: FACET_ATTRIBUTES,
      limit: SEARCH_HITS_LIMIT,
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
    totalHits: result.estimatedTotalHits,
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
  }
}
