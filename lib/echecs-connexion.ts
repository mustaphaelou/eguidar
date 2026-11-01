import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api"
import "server-only"

import {
  CODE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  ECHEANCES_MAX_CONNEXIONS_ECHOUEES,
  FENETRE_ECHEANCES_CONNEXION_MS,
  MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  cleEchecsConnexion,
} from "@/lib/echecs-connexion-regles"
import { getRedis } from "@/lib/redis"

type ClientRedis = NonNullable<ReturnType<typeof getRedis>>

const CHEMIN_CONNEXION_MOT_DE_PASSE = "/sign-in/email"

function adresseDuCorps(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const email = (body as { email?: unknown }).email
  return typeof email === "string" && email.trim() !== "" ? email : null
}

/**
 * Le compteur vit dans Redis pour survivre à un redémarrage de conteneur et
 * rester unique quand plusieurs répliques servent la boutique. Une panne du
 * magasin laisse passer la tentative : le limiteur par adresse reste la
 * première ligne, et un Redis indisponible ne doit pas fermer la Connexion à
 * tout le monde.
 */
async function clientRedis(): Promise<ClientRedis | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    if (!redis.isOpen) await redis.connect()
  } catch {
    // Une autre requête a pu ouvrir la connexion entre-temps.
  }
  return redis.isOpen ? redis : null
}

export async function connexionTemporairementVerrouillee(
  email: string
): Promise<boolean> {
  try {
    const redis = await clientRedis()
    if (!redis) return false
    const valeur = await redis.get(cleEchecsConnexion(email))
    return Number(valeur ?? 0) >= ECHEANCES_MAX_CONNEXIONS_ECHOUEES
  } catch {
    return false
  }
}

export async function compterEchecConnexion(email: string): Promise<void> {
  try {
    const redis = await clientRedis()
    if (!redis) return
    const cle = cleEchecsConnexion(email)
    const multi = redis.multi()
    multi.incr(cle)
    // La fenêtre part du dernier échec compté : le verrou dure quinze minutes
    // après le dixième échec, pas depuis le premier.
    multi.pExpire(cle, FENETRE_ECHEANCES_CONNEXION_MS)
    await multi.exec()
  } catch {
    // Le compteur est une seconde ligne : son indisponibilité ne refuse rien.
  }
}

export async function reinitialiserEchecsConnexion(
  email: string
): Promise<void> {
  try {
    const redis = await clientRedis()
    if (!redis) return
    await redis.del(cleEchecsConnexion(email))
  } catch {
    // Idem : une remise à zéro manquée laisse seulement le compteur expirer.
  }
}

export const hooksEchecsConnexion = {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== CHEMIN_CONNEXION_MOT_DE_PASSE) return
    const email = adresseDuCorps(ctx.body)
    if (!email) return
    if (!(await connexionTemporairementVerrouillee(email))) return

    throw APIError.from("TOO_MANY_REQUESTS", {
      code: CODE_COMPTE_TEMPORAIREMENT_VERROUILLE,
      message: MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE,
    })
  }),
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== CHEMIN_CONNEXION_MOT_DE_PASSE) return
    const email = adresseDuCorps(ctx.body)
    if (!email) return

    const retour = ctx.context.returned
    if (isAPIError(retour)) {
      if (retour.body?.code === "INVALID_EMAIL_OR_PASSWORD") {
        await compterEchecConnexion(email)
      }
      return
    }
    await reinitialiserEchecsConnexion(email)
  }),
}
