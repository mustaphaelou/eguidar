import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { moteurMeili } from "@/lib/meili"
import { retirerFacette, type MoteurRecherche } from "@/lib/moteur-recherche"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import {
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_DEFAULT,
  type SearchFacet,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"
import {
  LIBELLE_SANS_STRUCTURE,
  SLUG_SANS_STRUCTURE,
  type IndexableProduct,
} from "@/lib/index-projection"
import {
  lireStructure,
  type LectureStructure,
} from "@/lib/use-cases/lecture-structure"

export {
  buildSearchHref,
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

export { retirerFacette }

export interface OptionDeFiltre {
  value: string
  label: string
  count: number
  selected: boolean
}

export interface OptionsDeFiltre {
  brands: OptionDeFiltre[]
  categories: OptionDeFiltre[]
  priceBuckets: OptionDeFiltre[]
}

export interface RepartitionsDeFacettes {
  brands: Record<string, number>
  categories: Record<string, number>
  priceBuckets: Record<string, number>
}

function assemblerMarques(
  repartition: Record<string, number>,
  retenues: readonly string[]
): OptionDeFiltre[] {
  const valeurs = new Set([...Object.keys(repartition), ...retenues])
  return [...valeurs]
    .map((value) => ({
      value,
      label: value,
      count: repartition[value] ?? 0,
      selected: retenues.includes(value),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
}

function assemblerCategories(
  repartition: Record<string, number>,
  retenue: string | undefined,
  noms: ReadonlyMap<string, string>
): OptionDeFiltre[] {
  const valeurs = new Set(Object.keys(repartition))
  if (retenue) valeurs.add(retenue)
  return [...valeurs]
    .map((value) => ({
      value,
      label: noms.get(value) ?? value,
      count: repartition[value] ?? 0,
      selected: value === retenue,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
}

function assemblerTranches(
  repartition: Record<string, number>,
  retenue: string | undefined
): OptionDeFiltre[] {
  return PRICE_BUCKETS.map((bande) => ({
    value: bande.id,
    label: bande.label,
    count: repartition[bande.id] ?? 0,
    selected: bande.id === retenue,
  }))
}

function assemblerOptionsDeFiltre(
  repartitions: RepartitionsDeFacettes,
  filtres: SearchFilters,
  nomsDeCategories: ReadonlyMap<string, string>
): OptionsDeFiltre {
  return {
    brands: assemblerMarques(repartitions.brands, filtres.brand ?? []),
    categories: assemblerCategories(
      repartitions.categories,
      filtres.categorySlug,
      nomsDeCategories
    ),
    priceBuckets: assemblerTranches(
      repartitions.priceBuckets,
      filtres.priceBucketId
    ),
  }
}

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

export interface SearchPageData {
  query: string
  totalHits: number
  products: CarteProduit[]
  facets: OptionsDeFiltre
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

async function resoudreLesNomsDeCategories(
  structure: LectureStructure | undefined,
  slugs: Iterable<string>
): Promise<Map<string, string>> {
  const listeDesSlugs = [...slugs]
  if (listeDesSlugs.length === 0) return new Map()

  const lecture = structure ?? (await lireStructure())
  return new Map(
    listeDesSlugs.map((slug) => [
      slug,
      slug === SLUG_SANS_STRUCTURE
        ? LIBELLE_SANS_STRUCTURE
        : (lecture.structureParSlug(slug)?.name ?? slug),
    ])
  )
}

export async function searchProducts(
  query: string,
  filters: SearchFilters = {},
  options: SearchOptions = {},
  moteur: MoteurRecherche = moteurMeili(),
  structure?: LectureStructure
): Promise<SearchPageData> {
  const sort = options.sort ?? SEARCH_SORT_DEFAULT
  const pageSize = options.pageSize ?? SEARCH_PAGE_SIZE
  const requestedPage = options.page ?? 1

  const emptyResult: SearchPageData = {
    query,
    totalHits: 0,
    products: [],
    facets: assemblerOptionsDeFiltre(
      { brands: {}, categories: {}, priceBuckets: {} },
      filters,
      new Map<string, string>()
    ),
    sort,
    currentPage: 1,
    totalPages: 1,
    pageSize,
  }

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
    if (clampedResult.statut === "indisponible") return emptyResult
    documents = clampedResult.documents
  }

  const repartitions: RepartitionsDeFacettes = {
    brands: brandFacets.repartitions.brand ?? {},
    categories: categoryFacets.repartitions.categorySlug ?? {},
    priceBuckets: priceFacets.repartitions.priceBucket ?? {},
  }

  const slugs = new Set(Object.keys(repartitions.categories))
  if (filters.categorySlug) slugs.add(filters.categorySlug)
  const categoryNames = await resoudreLesNomsDeCategories(structure, slugs)

  const facets = assemblerOptionsDeFiltre(repartitions, filters, categoryNames)

  return {
    query,
    totalHits,
    products: documents.map(carteDuHit),
    facets,
    sort,
    currentPage,
    totalPages,
    pageSize,
  }
}

export interface SuggestionProduit {
  id: string
  name: string
  slug: string
  brand: string
  image: string | null
  minPrice: number
}

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

function comparerParComptePuisSlug(
  [slugGauche, compteGauche]: [string, number],
  [slugDroite, compteDroite]: [string, number]
): number {
  return (
    compteDroite - compteGauche ||
    (slugGauche < slugDroite ? -1 : slugGauche > slugDroite ? 1 : 0)
  )
}

export async function searchSuggestions(
  query: string,
  moteur: MoteurRecherche = moteurMeili(),
  structure?: LectureStructure
): Promise<SearchSuggestionsData> {
  const emptyResult: SearchSuggestionsData = { products: [], categories: [] }

  const reponse = await moteur.chercher({
    query,
    taille: SEARCH_SUGGESTION_LIMIT,
    facettes: ["categorySlug"],
  })

  if (reponse.statut === "indisponible") return emptyResult

  const categorySlugCounts = Object.entries(
    reponse.repartitions.categorySlug ?? {}
  )
    .sort(comparerParComptePuisSlug)
    .slice(0, SEARCH_SUGGESTION_CATEGORY_LIMIT)
  const categoryNames = await resoudreLesNomsDeCategories(
    structure,
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
