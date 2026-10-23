import {
  DELAI_PURGE_EDGE_MS,
  LIMITE_URLS_PAR_APPEL_PURGE,
  lotsDePurge,
  urlsUniques,
  type CodeEchecPurge,
  type DemandePurge,
  type EchecPurgeEdge,
  type PortPurgeEdge,
  type ResultatPurgeEdge,
} from "@/lib/purge-edge"

const URL_API = "https://api.cloudflare.com/client/v4/zones"

type Environnement = Record<string, string | undefined>

export type TransportPurge = (
  url: string,
  init: RequestInit
) => Promise<Response>

export interface OptionsPurgeEdgeCloudflare {
  env?: Environnement
  transport?: TransportPurge
  limiteUrlsParAppel?: number
}

interface ConfigurationPurge {
  zoneId: string
  jeton: string
}

export function configurationPurgeEdge(
  env: Environnement = process.env
): ConfigurationPurge | null {
  const zoneId = (env.CLOUDFLARE_ZONE_ID ?? "").trim()
  const jeton = (env.CLOUDFLARE_API_TOKEN ?? "").trim()
  if (!zoneId || !jeton) return null
  return { zoneId, jeton }
}

function echec(
  code: CodeEchecPurge,
  message: string
): {
  ok: false
  erreur: EchecPurgeEdge
} {
  return { ok: false, erreur: { code, message } }
}

interface ChargeCloudflare {
  success?: unknown
  errors?: { message?: unknown }[]
}

function messageDesErreurs(charge: ChargeCloudflare): string {
  for (const erreur of charge.errors ?? []) {
    if (typeof erreur?.message === "string" && erreur.message !== "") {
      return erreur.message
    }
  }
  return "réponse Cloudflare en échec"
}

async function echecDeLaReponse(
  reponse: Response
): Promise<EchecPurgeEdge | null> {
  let charge: ChargeCloudflare | null = null
  try {
    charge = (await reponse.json()) as ChargeCloudflare
  } catch {
    charge = null
  }

  if (!reponse.ok) {
    // Même message que `scripts/purger-edge.mjs` : un refus HTTP porte le
    // message de Cloudflare quand la réponse en contient un.
    const detail = charge === null ? "" : messageDesErreurs(charge)
    return {
      code: "erreur-purge",
      message: `HTTP ${reponse.status}${detail === "" ? "" : ` — ${detail}`}`,
    }
  }
  if (charge === null) {
    return { code: "erreur-purge", message: "réponse Cloudflare illisible" }
  }
  if (charge.success === false) {
    return { code: "erreur-purge", message: messageDesErreurs(charge) }
  }
  return null
}

function corpsDe(demande: DemandePurge): Record<string, unknown> {
  return demande.kind === "tout"
    ? { purge_everything: true }
    : { files: [...demande.urls] }
}

function messageDuTransport(error: unknown): string {
  return error instanceof Error && error.message !== ""
    ? error.message
    : "transport Cloudflare indisponible"
}

export function creerPurgeEdgeCloudflare(
  options: OptionsPurgeEdgeCloudflare = {}
): PortPurgeEdge {
  return {
    async purger(demande): Promise<ResultatPurgeEdge> {
      const configuration = configurationPurgeEdge(options.env ?? process.env)
      if (!configuration) {
        return echec(
          "non-configure",
          "Cloudflare n'est pas configuré : renseignez CLOUDFLARE_ZONE_ID et CLOUDFLARE_API_TOKEN"
        )
      }

      const transport: TransportPurge =
        options.transport ?? ((url, init) => globalThis.fetch(url, init))
      const lots = lotsDePurge(
        demande,
        options.limiteUrlsParAppel ?? LIMITE_URLS_PAR_APPEL_PURGE
      )

      let premiereErreur: EchecPurgeEdge | null = null
      for (const lot of lots) {
        try {
          const reponse = await transport(
            `${URL_API}/${encodeURIComponent(configuration.zoneId)}/purge_cache`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${configuration.jeton}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(corpsDe(lot)),
              signal: AbortSignal.timeout(DELAI_PURGE_EDGE_MS),
            }
          )
          const erreur = await echecDeLaReponse(reponse)
          if (erreur !== null && premiereErreur === null) {
            premiereErreur = erreur
          }
        } catch (error) {
          if (premiereErreur === null) {
            premiereErreur = {
              code: "erreur-purge",
              message: messageDuTransport(error),
            }
          }
        }
      }

      if (premiereErreur !== null) return { ok: false, erreur: premiereErreur }
      return {
        ok: true,
        urls: demande.kind === "urls" ? urlsUniques(demande.urls) : [],
      }
    },
  }
}
