import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api"
import "server-only"

import {
  CODE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  ECHEANCES_MAX_CONNEXIONS_ECHOUEES,
  FENETRE_ECHEANCES_CONNEXION_MS,
  MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  cleEchecsConnexion,
} from "@/lib/echecs-connexion-regles"
import { clientRedisPret } from "@/lib/redis"
import { estIdentifiantsInvalides } from "@/lib/refus-authentification"

const CHEMIN_CONNEXION_MOT_DE_PASSE = "/sign-in/email"

function adresseDuCorps(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const email = (body as { email?: unknown }).email
  return typeof email === "string" && email.trim() !== "" ? email : null
}

export async function connexionTemporairementVerrouillee(
  email: string
): Promise<boolean> {
  try {
    const redis = await clientRedisPret()
    if (!redis) return false
    const valeur = await redis.get(cleEchecsConnexion(email))
    return Number(valeur ?? 0) >= ECHEANCES_MAX_CONNEXIONS_ECHOUEES
  } catch {
    return false
  }
}

export async function compterEchecConnexion(email: string): Promise<void> {
  try {
    const redis = await clientRedisPret()
    if (!redis) return
    const cle = cleEchecsConnexion(email)
    const multi = redis.multi()
    multi.incr(cle)
    multi.pExpire(cle, FENETRE_ECHEANCES_CONNEXION_MS)
    await multi.exec()
  } catch {}
}

export async function reinitialiserEchecsConnexion(
  email: string
): Promise<void> {
  try {
    const redis = await clientRedisPret()
    if (!redis) return
    await redis.del(cleEchecsConnexion(email))
  } catch {}
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
      if (estIdentifiantsInvalides(retour.body?.code)) {
        await compterEchecConnexion(email)
      }
      return
    }
    await reinitialiserEchecsConnexion(email)
  }),
}
