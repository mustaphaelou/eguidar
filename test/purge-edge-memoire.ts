import {
  lotsDePurge,
  urlsUniques,
  type DemandePurge,
  type PortPurgeEdge,
  type ResultatPurgeEdge,
} from "@/lib/purge-edge"

export interface OptionsPurgeEdgeMemoire {
  limiteUrlsParAppel?: number
  configure?: boolean
  panne?: boolean
}

export interface PurgeEdgeMemoire extends PortPurgeEdge {
  readonly lots: DemandePurge[]
  configure: boolean
  panne: boolean
}

export function creerPurgeEdgeMemoire(
  options: OptionsPurgeEdgeMemoire = {}
): PurgeEdgeMemoire {
  const lots: DemandePurge[] = []
  const purge: PurgeEdgeMemoire = {
    lots,
    configure: options.configure ?? true,
    panne: options.panne ?? false,

    async purger(demande): Promise<ResultatPurgeEdge> {
      if (!purge.configure) {
        return {
          ok: false,
          erreur: {
            code: "non-configure",
            message: "Purge de l'edge en mémoire non configurée",
          },
        }
      }

      lots.push(...lotsDePurge(demande, options.limiteUrlsParAppel))

      if (purge.panne) {
        return {
          ok: false,
          erreur: {
            code: "erreur-purge",
            message: "Purge de l'edge en mémoire en panne",
          },
        }
      }

      return {
        ok: true,
        urls: demande.kind === "urls" ? urlsUniques(demande.urls) : [],
      }
    },
  }
  return purge
}
