import type { IndexableProduct } from "@/lib/index-projection"
import type { SearchFacet, SearchFilters, SearchSort } from "@/lib/search-params"

/**
 * Moteur de recherche — couture neutre, sans directive.
 *
 * NE JAMAIS importer `meilisearch` (le SDK), `@/lib/meili` (son adaptateur),
 * `@/lib/db`, `next/headers` ni `server-only` ici : ce module nomme la
 * couture de la Recherche, jamais un moteur, et la garde
 * `lib/moteur-recherche-frontiere.test.ts` verrouille cette neutralité.
 * Son vocabulaire est celui de la Recherche — Requête (texte, Filtres,
 * tri, page et taille, facettes à compter), Réponse (Documents d'index,
 * total du moteur, répartitions par facette), ou Indisponibilité (un
 * moteur absent ou injoignable, qui n'est pas un Catalogue vide) — et il
 * ne réutilise que des types purs (`@/lib/search-params`,
 * `@/lib/index-projection`).
 *
 * Les Documents d'index traversent la couture déjà cuisinés (ADR-0013,
 * ADR-0022) : `minPrice` et `totalStock` sont calculés au réindexage,
 * aucun moteur ne les recalcule. Le total est l'estimation du moteur
 * (`estimatedTotalHits` chez Meili), jamais un décompte exact.
 *
 * `retirerFacette` porte la règle d'ADR-0016, seule et pure : le décompte
 * d'une facette ignore sa propre clause. Elle est retirée au-dessus de la
 * couture, une seule fois, avant que les filtres ne descendent vers un
 * moteur — un moteur applique exactement les filtres qu'il reçoit.
 */

export interface RequeteMoteur {
  /** the Visiteur's query, already trimmed; "" means browse */
  query: string
  filtres?: SearchFilters
  tri?: SearchSort
  /** 1-based page; ignored when `taille` is 0 */
  page?: number
  taille?: number
  facettes?: SearchFacet[]
}

export interface RepartitionsMoteur {
  brand?: Record<string, number>
  categorySlug?: Record<string, number>
  priceBucket?: Record<string, number>
}

export interface ReponseDocuments {
  statut: "ok"
  documents: IndexableProduct[]
  /** the engine's estimate (`estimatedTotalHits` in Meili), never an exact count */
  total: number
  repartitions: RepartitionsMoteur
}

export interface ReponseIndisponible {
  statut: "indisponible"
}

export type ReponseMoteur = ReponseDocuments | ReponseIndisponible

export interface MoteurRecherche {
  chercher(requete: RequeteMoteur): Promise<ReponseMoteur>
}

/**
 * Retire des filtres la clause de la facette visée et rien d'autre :
 * `brand` retire la liste des marques, `categorySlug` la clé du même nom,
 * `priceBucket` la Tranche de prix (`priceBucketId`). Retourne de nouveaux
 * filtres, sans jamais muter l'argument — les autres clauses sont
 * recopiées telles quelles.
 */
export function retirerFacette(
  filtres: SearchFilters,
  facette: SearchFacet
): SearchFilters {
  const restants: SearchFilters = { ...filtres }
  if (facette === "brand") delete restants.brand
  if (facette === "categorySlug") delete restants.categorySlug
  if (facette === "priceBucket") delete restants.priceBucketId
  return restants
}
