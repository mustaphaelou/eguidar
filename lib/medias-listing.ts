export const MEDIAS_LISTING_PATH = "/admin/medias"

export interface MediasListingParams {
  q?: string
  inutilisees?: boolean
  sansAlt?: boolean
}

type RawSearchParams = Record<string, string | string[] | undefined>

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function estVrai(value: string | undefined): boolean {
  return value === "1" || value === "true"
}

export function parseMediasListingParams(
  raw: RawSearchParams
): MediasListingParams {
  const params: MediasListingParams = {}
  const q = firstValue(raw.q)?.trim()
  if (q) params.q = q
  if (estVrai(firstValue(raw.inutilisees))) params.inutilisees = true
  if (estVrai(firstValue(raw["sans-alt"]))) params.sansAlt = true
  return params
}

export function buildMediasListingUrl(params: MediasListingParams): string {
  const recherche = new URLSearchParams()
  const q = params.q?.trim()
  if (q) recherche.set("q", q)
  if (params.inutilisees) recherche.set("inutilisees", "1")
  if (params.sansAlt) recherche.set("sans-alt", "1")
  const requete = recherche.toString()
  return requete ? `${MEDIAS_LISTING_PATH}?${requete}` : MEDIAS_LISTING_PATH
}
