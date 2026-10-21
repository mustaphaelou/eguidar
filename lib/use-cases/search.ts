import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import {
  etatDesFiltres,
  retirerFacette,
  type CleDeFiltre,
  type FiltreActif,
  type OptionsDeFiltre,
  type RepartitionsDeFacettes,
} from "@/lib/filtre-de-recherche"
import { moteurMeili } from "@/lib/meili"
import type { MoteurRecherche } from "@/lib/moteur-recherche"
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

// Réexports temporaires du module neutre, que #732 supprime.
export type { FiltreActif } from "@/lib/filtre-de-recherche"
export type { OptionDeFiltre } from "@/lib/filtre-de-recherche"
export type { OptionsDeFiltre } from "@/lib/filtre-de-recherche"
export type { RepartitionsDeFacettes } from "@/lib/filtre-de-recherche"

const FACETTE_DU_MOTEUR = {
  marque: "brand",
  categorie: "categorySlug",
  prix: "priceBucket",
} as const satisfies Record<CleDeFiltre, SearchFacet>

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
  filtresActifs: readonly FiltreActif[]
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

  const etatVide = etatDesFiltres(
    { marque: {}, categorie: {}, prix: {} },
    filters,
    new Map<string, string>()
  )

  const emptyResult: SearchPageData = {
    query,
    totalHits: 0,
    products: [],
    facets: etatVide.options,
    filtresActifs: etatVide.filtresActifs,
    sort,
    currentPage: 1,
    totalPages: 1,
    pageSize,
  }

  const requeteDeFacette = (cle: CleDeFiltre) => {
    const facette = FACETTE_DU_MOTEUR[cle]
    return moteur.chercher({
      query,
      filtres: retirerFacette(filters, cle),
      tri: sort,
      taille: 0,
      facettes: [facette],
    })
  }

  const [initialResult, reponseMarque, reponseCategorie, reponsePrix] =
    await Promise.all([
      moteur.chercher({
        query,
        filtres: filters,
        tri: sort,
        page: requestedPage,
        taille: pageSize,
      }),
      requeteDeFacette("marque"),
      requeteDeFacette("categorie"),
      requeteDeFacette("prix"),
    ])

  if (
    initialResult.statut === "indisponible" ||
    reponseMarque.statut === "indisponible" ||
    reponseCategorie.statut === "indisponible" ||
    reponsePrix.statut === "indisponible"
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
    marque: reponseMarque.repartitions[FACETTE_DU_MOTEUR.marque] ?? {},
    categorie: reponseCategorie.repartitions[FACETTE_DU_MOTEUR.categorie] ?? {},
    prix: reponsePrix.repartitions[FACETTE_DU_MOTEUR.prix] ?? {},
  }

  const slugs = new Set(Object.keys(repartitions.categorie))
  if (filters.categorySlug) slugs.add(filters.categorySlug)
  const categoryNames = await resoudreLesNomsDeCategories(structure, slugs)

  const { options: facets, filtresActifs } = etatDesFiltres(
    repartitions,
    filters,
    categoryNames
  )

  return {
    query,
    totalHits,
    products: documents.map(carteDuHit),
    facets,
    filtresActifs,
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
