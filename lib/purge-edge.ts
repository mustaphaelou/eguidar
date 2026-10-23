export const LIMITE_URLS_PAR_APPEL_PURGE = 100

export const DELAI_PURGE_EDGE_MS = 5_000

export type CodeEchecPurge = "non-configure" | "erreur-purge"

export interface EchecPurgeEdge {
  code: CodeEchecPurge
  message: string
}

export type ResultatPurgeEdge =
  { ok: true; urls: readonly string[] } | { ok: false; erreur: EchecPurgeEdge }

export type DemandePurge =
  { kind: "urls"; urls: readonly string[] } | { kind: "tout" }

export interface PortPurgeEdge {
  purger(demande: DemandePurge): Promise<ResultatPurgeEdge>
}

export function urlsUniques(urls: readonly string[]): string[] {
  return [...new Set(urls)]
}

export function lotsDePurge(
  demande: DemandePurge,
  limite?: number
): readonly DemandePurge[] {
  if (demande.kind === "tout") return [demande]

  const urls = urlsUniques(demande.urls)
  if (urls.length === 0) return []

  const parAppel =
    limite !== undefined && Number.isInteger(limite) && limite > 0
      ? limite
      : LIMITE_URLS_PAR_APPEL_PURGE
  const lots: DemandePurge[] = []
  for (let debut = 0; debut < urls.length; debut += parAppel) {
    lots.push({ kind: "urls", urls: urls.slice(debut, debut + parAppel) })
  }
  return lots
}
