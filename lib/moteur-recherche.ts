import type { IndexableProduct } from "@/lib/index-projection"
import type {
  SearchFacet,
  SearchFilters,
  SearchSort,
} from "@/lib/search-params"

export interface RequeteMoteur {
  query: string
  filtres?: SearchFilters
  tri?: SearchSort
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
