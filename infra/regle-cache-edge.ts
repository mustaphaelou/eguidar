import { SLUG_DE_REPLI } from "@/lib/parametre-de-repli"
import { HOTE_EDGE } from "@/lib/zone-edge"

export const TETES_RSC = ["rsc", "next-router-prefetch"] as const

export const PHASE_CACHE = "http_request_cache_settings"

export type ModeTtlEdge =
  "respect_origin" | "override_origin" | "bypass_by_default"

export interface ParametresCacheEdge {
  cache: boolean
  edge_ttl?: { mode: ModeTtlEdge }
}

export interface RegleCacheEdge {
  ref: string
  description: string
  enabled: boolean
  expression: string
  action: "set_cache_settings"
  action_parameters: ParametresCacheEdge
}

export interface ArtefactRegleCacheEdge {
  zone: string
  phase: typeof PHASE_CACHE
  rules: RegleCacheEdge[]
}

function presence(tete: string): string {
  return `any(lower(http.request.headers.names[*])[*] eq "${tete}")`
}

export function expressionRscEtPrefetch(): string {
  return `(${TETES_RSC.map(presence).join(" or ")})`
}

function gardeRscEtPrefetch(): string {
  return TETES_RSC.map((tete) => `not ${presence(tete)}`).join(" and ")
}

function gardeSlugDeRepli(): string {
  return `not ends_with(http.request.uri.path, "/${SLUG_DE_REPLI}")`
}

export function expressionDocumentsAnonymes(): string {
  return (
    "(" +
    [
      `http.host eq "${HOTE_EDGE}"`,
      `not starts_with(http.request.uri.path, "/api/")`,
      `not starts_with(http.request.uri.path, "/_next/")`,
      gardeSlugDeRepli(),
      gardeRscEtPrefetch(),
    ].join(" and ") +
    ")"
  )
}

export function artefactRegleCacheEdge(): ArtefactRegleCacheEdge {
  return {
    zone: HOTE_EDGE,
    phase: PHASE_CACHE,
    rules: [
      {
        ref: "rsc-et-prefetch-hors-cache",
        description:
          "Un payload RSC n'est jamais un document : la clé de cache ignore RSC",
        enabled: true,
        expression: expressionRscEtPrefetch(),
        action: "set_cache_settings",
        action_parameters: { cache: false },
      },
      {
        ref: "documents-anonymes-eguidar",
        description:
          "HTML cache-eligible pour l'hôte, TTL d'origine, Set-Cookie jamais stocké",
        enabled: true,
        expression: expressionDocumentsAnonymes(),
        action: "set_cache_settings",
        action_parameters: {
          cache: true,
          edge_ttl: { mode: "bypass_by_default" },
        },
      },
    ],
  }
}
