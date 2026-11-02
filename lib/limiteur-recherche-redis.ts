import "server-only"

import {
  BUDGET_LIMITEUR_RECHERCHE,
  FENETRE_LIMITEUR_RECHERCHE_MS,
  LimiteurRechercheIndisponibleError,
  type OptionsLimiteurRecherche,
  type PortLimiteurRecherche,
} from "@/lib/limiteur-recherche"
import { clientRedisPret, getRedis, type ClientRedis } from "@/lib/redis"

const PREFIXE_CLE = "eguidar:limiteur-recherche:"

export type ObtenirClientRedis = () => ClientRedis | null

export function creerLimiteurRechercheRedis(
  obtenirClient: ObtenirClientRedis = getRedis,
  options: OptionsLimiteurRecherche = {}
): PortLimiteurRecherche {
  const fenetreMs = options.fenetreMs ?? FENETRE_LIMITEUR_RECHERCHE_MS
  const budget = options.budget ?? BUDGET_LIMITEUR_RECHERCHE

  return {
    async consommer(cle) {
      const client = await clientRedisPret(obtenirClient)
      if (!client) {
        throw new LimiteurRechercheIndisponibleError("REDIS_URL absent")
      }

      const cleRedis = `${PREFIXE_CLE}${cle}`
      const multi = client.multi()
      multi.incr(cleRedis)
      multi.pExpire(cleRedis, fenetreMs, "NX")
      const reponses = await multi.exec()

      const compte = Number(reponses[0])
      if (!Number.isFinite(compte)) {
        throw new LimiteurRechercheIndisponibleError(
          "réponse inattendue du limiteur Redis"
        )
      }
      return compte <= budget ? "autorise" : "refuse"
    },
  }
}
