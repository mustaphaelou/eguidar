import "server-only"

import {
  adresseClient,
  type EntetesRequete,
  type PortLimiteurRecherche,
} from "@/lib/limiteur-recherche"
import { creerLimiteurRechercheRedis } from "@/lib/limiteur-recherche-redis"

export const MESSAGE_LIMITEUR_INDISPONIBLE =
  "[recherche] limiteur indisponible — la Recherche reste ouverte"

const limiteurProduction = creerLimiteurRechercheRedis()

export async function autoriserRecherche(
  entetes: EntetesRequete,
  limiteur: PortLimiteurRecherche = limiteurProduction
): Promise<boolean> {
  try {
    return (await limiteur.consommer(adresseClient(entetes))) === "autorise"
  } catch (erreur) {
    console.warn(MESSAGE_LIMITEUR_INDISPONIBLE, erreur)
    return true
  }
}
