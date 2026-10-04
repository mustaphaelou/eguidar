import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import { moteurMeili } from "@/lib/meili"
import { retirerFacette, type MoteurRecherche } from "@/lib/moteur-recherche"
import {
  assemblerOptionsDeFiltre,
  type OptionsDeFiltre,
  type RepartitionsDeFacettes,
} from "@/lib/options-de-filtre"
import {
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_DEFAULT,
  type SearchFacet,
  type SearchFilters,
  type SearchSort,
} from "@/lib/search-params"
import type { IndexableProduct } from "@/lib/index-projection"

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

// `retirerFacette` reste la propriété publique de la Recherche (ADR-0016) :
// le retrait se fait ici, une seule fois, avant que les filtres ne descendent
// vers un moteur — un moteur applique exactement les filtres qu'il reçoit.
export { retirerFacette }

/**
 * Carte produit d'un résultat de Recherche : les résultats demandent les huit
 * attributs du Document d'index, donc les deux métriques arrivent cuites et
 * sont passées telles quelles — la projection sous « montrer » les exige.
 */
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

  // Une panne rend l'écran d'aujourd'hui — le Catalogue vide, sans bornage de
  // page — mais pas des options vides : l'assemblage tourne sur des
  // répartitions vides, donc l'univers des Tranches de prix sort à zéro et
  // chaque valeur retenue reste émise, visible et retirable dans la barre
  // latérale comme dans les puces. La carte de libellés est vide : une
  // catégorie retenue garde son slug, et aucune nomenclature n'est lue en
  // base sur ce chemin.
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

  // La requête de décompte d'une facette (ADR-0016) : `taille: 0`, les
  // filtres reçus moins la clause de la facette comptée, et rien d'autre à
  // retirer en chemin — chaque moteur applique exactement ce qu'il reçoit.
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

  const repartitions: RepartitionsDeFacettes = {
    brands: brandFacets.repartitions.brand ?? {},
    categories: categoryFacets.repartitions.categorySlug ?? {},
    priceBuckets: priceFacets.repartitions.priceBucket ?? {},
  }

  // Les noms de catégorie se lisent ici, une fois, et arrivent résolus dans
  // l'assemblage : le module d'options ne reçoit que des faits et
  // n'interroge rien. La catégorie retenue est résolue elle aussi, même
  // absente de sa répartition — c'est la règle d'ADR-0016, dont l'option
  // porte la conséquence d'affichage.
  const slugs = new Set(Object.keys(repartitions.categories))
  if (filters.categorySlug) slugs.add(filters.categorySlug)
  const categoryNames = await fetchCategoryNames([...slugs])

  // L'assemblage unique du panneau : les trois listes d'options naissent
  // ici, à côté des requêtes de facettes qui les comptent, et la barre
  // latérale ne fait plus que les rendre.
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

/**
 * Suggestion de produit depuis un Document d'index complet : la Recherche
 * projette ici les six faits de la rangée, au-dessus de la couture. Le stock
 * total et la Livraison offerte restent volontairement absents des faits
 * passés à « masquer » : leur absence signifie « inconnu » et ne retire donc
 * jamais la ligne, comme auparavant.
 */
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

/**
 * Compare deux entrées d'une répartition : le compte d'abord, le slug ensuite.
 *
 * **L'égalité est départagée par le slug, et c'est un choix, pas un reste.**
 * Sans lui, deux catégories aussi demandées l'une que l'autre arriveraient dans
 * l'ordre où le moteur a produit ses clés — l'ordre des Documents pour le
 * moteur en mémoire, l'ordre alphabétique chez Meilisearch. Les deux moteurs
 * remettraient alors deux réponses différentes pour une même répartition, et
 * c'est précisément ce que la Recherche refuse de laisser faire : elle promet
 * la même réponse partout, donc elle choisit elle-même.
 *
 * Le slug est le nom propre de la catégorie dans le Catalogue : il est unique,
 * donc le départage est **total** et l'ordre obtenu ne dépend d'aucun ordre
 * d'arrivée. Le tri n'a pas besoin d'être stable pour l'être ici.
 *
 * La comparaison est faite caractère par caractère plutôt qu'avec
 * `localeCompare` : celle-ci suit la locale de qui rend, et la réponse doit
 * être la même sur le serveur de production et dans le navigateur d'un Visiteur
 * qui écrit `fr-CA`. C'est aussi l'ordre dans lequel Meilisearch rend ses
 * valeurs de facette, si bien qu'à égalité de compte la suite proposée ne
 * bouge pas d'un moteur à l'autre.
 */
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

  // Le choix des catégories se fait **ici**, au-dessus de la couture, et non
  // dans l'ordre où un moteur produit ses clés : Meilisearch rend ses valeurs
  // de facette par ordre alphabétique — `#531` l'a mesuré et l'a épinglé en
  // littéral (`sortFacetValuesBy: { "*": "alpha" }`) — et prendre les premières
  // entrées proposait donc au Visiteur ce qui commence par A, quoi qu'il ait
  // demandé. L'ordre des valeurs de facette est un réglage du moteur, et le
  // Visiteur ne doit pas avoir à le connaître pour que ses suggestions soient
  // les bonnes : la décision se prend au lieu où la suggestion se construit, ce
  // qui la rend identique quel que soit le moteur.
  //
  // **Ce que ce tri peut classer, c'est ce que le moteur a rendu.** Meilisearch
  // plafonne ses valeurs de facette à cent par facette — le même épinglage que
  // tout à l'heure — et les coupe donc avant qu'elles n'arrivent ici. Sur un
  // Catalogue de plus de cent catégories, la suggestion ne peut pas offrir
  // celles que le moteur n'a jamais nommé ; elle classe les cent qu'il a
  // nommées. C'est un fait du moteur, dit et laissé tel quel, et non une
  // limite de ce tri : la borne se lève dans le moteur ou nulle part.
  const categorySlugCounts = Object.entries(
    reponse.repartitions.categorySlug ?? {}
  )
    .sort(comparerParComptePuisSlug)
    .slice(0, SEARCH_SUGGESTION_CATEGORY_LIMIT)
  const categoryNames = await fetchCategoryNames(
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
