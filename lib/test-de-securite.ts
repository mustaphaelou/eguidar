import type { BetterAuthPlugin } from "better-auth"

import { ADRESSE_CLIENT_PARTAGEE, adresseClient } from "@/lib/adresse-client"
import {
  ACTIONS_PAR_TYPE_OTP,
  ACTIONS_TEST_DE_SECURITE,
  type ActionTestDeSecurite,
  type TypeOtp,
} from "@/lib/vocabulaire-test-de-securite"

/**
 * Le Test de sécurité est tenu par une couture locale, et non par le plugin
 * `captcha` de la bibliothèque : ce plugin vérifie une seule `expectedAction`
 * pour toute sa liste de points d'entrée, alors qu'un jeton doit être lié à
 * l'Envoi protégé qui l'a demandé. La couture reprend le mode d'échec fermé, les
 * codes d'erreur et le délai de la bibliothèque.
 *
 * C'est la seule chose que le dépôt ne peut pas déléguer ici : la vérification
 * elle-même reste celle de Cloudflare Turnstile, et le contrôle d'origine de la
 * Connexion sociale reste celui de la bibliothèque (ADR-0041).
 */
const URL_VERIFICATION =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

const DUREE_MAXIMALE_VERIFICATION_MS = 10_000

/**
 * Les hôtes sur lesquels le widget peut être rendu : le seul *Hôte canonique*
 * et l'hôte du déploiement, qu'une prévisualisation Coolify remplace par le
 * sien. `www` n'en fait pas partie : il redirige vers l'apex à l'edge.
 */
export function hotesDuTestDeSecurite(): string[] {
  const hotes = new Set(["eguidar.com"])
  for (const origine of [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  ]) {
    if (!origine) continue
    try {
      hotes.add(new URL(origine).hostname)
    } catch {}
  }
  return [...hotes]
}

export type EnvoiProtege = {
  chemin: string
  type?: TypeOtp
  action: ActionTestDeSecurite
}

export const ENVOIS_PROTEGES: readonly EnvoiProtege[] = [
  { chemin: "/sign-up/email", action: ACTIONS_TEST_DE_SECURITE.inscription },
  { chemin: "/sign-in/email", action: ACTIONS_TEST_DE_SECURITE.connexion },
  {
    chemin: "/email-otp/send-verification-otp",
    type: "email-verification",
    action: ACTIONS_PAR_TYPE_OTP["email-verification"],
  },
  {
    chemin: "/email-otp/send-verification-otp",
    type: "forget-password",
    action: ACTIONS_PAR_TYPE_OTP["forget-password"],
  },
]

type CorpsEnvoi = { type?: string } | null

export type ReponseTestDeSecurite = { response: Response } | undefined

export function actionPourEnvoi(
  chemin: string,
  corps: CorpsEnvoi
): ActionTestDeSecurite | null {
  const envoi = ENVOIS_PROTEGES.find(
    (candidat) =>
      chemin.endsWith(candidat.chemin) &&
      (candidat.type === undefined || corps?.type === candidat.type)
  )
  return envoi?.action ?? null
}

function refus(
  message: string,
  code: string,
  status: number
): ReponseTestDeSecurite {
  return {
    response: new Response(JSON.stringify({ message, code }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  }
}

export async function verifierTestDeSecurite({
  requete,
  action,
  secretKey,
  allowedHostnames,
  fetch = globalThis.fetch,
}: {
  requete: Request
  action: ActionTestDeSecurite
  secretKey: string
  allowedHostnames: readonly string[]
  fetch?: typeof globalThis.fetch
}): Promise<ReponseTestDeSecurite> {
  const jeton = requete.headers.get("x-captcha-response")
  if (!jeton) return refus("Missing CAPTCHA response", "MISSING_RESPONSE", 400)

  const adresse = adresseClient(requete.headers)
  const remoteip = adresse === ADRESSE_CLIENT_PARTAGEE ? undefined : adresse

  let reponse: Response
  try {
    reponse = await fetch(URL_VERIFICATION, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: jeton,
        ...(remoteip ? { remoteip } : {}),
      }),
      signal: AbortSignal.timeout(DUREE_MAXIMALE_VERIFICATION_MS),
    })
  } catch {
    return refus("Something went wrong", "UNKNOWN_ERROR", 500)
  }

  if (!reponse.ok) return refus("Something went wrong", "UNKNOWN_ERROR", 500)

  let resultat: { success?: boolean; action?: string; hostname?: string }
  try {
    resultat = (await reponse.json()) as typeof resultat
  } catch {
    return refus("Something went wrong", "UNKNOWN_ERROR", 500)
  }

  if (!resultat.success) {
    return refus("Captcha verification failed", "VERIFICATION_FAILED", 403)
  }
  if (resultat.action !== action) {
    return refus("Captcha verification failed", "VERIFICATION_FAILED", 403)
  }
  if (!resultat.hostname || !allowedHostnames.includes(resultat.hostname)) {
    return refus("Captcha verification failed", "VERIFICATION_FAILED", 403)
  }

  return undefined
}

export function pluginTestDeSecurite({
  secretKey,
  allowedHostnames,
}: {
  secretKey: string
  allowedHostnames: readonly string[]
}): BetterAuthPlugin {
  return {
    id: "test-de-securite",
    onRequest: async (request, ctx) => {
      if (request.method !== "POST") return

      const { pathname } = new URL(request.url)
      const basePath = ctx.options.basePath ?? "/api/auth"
      const chemin = pathname.startsWith(basePath)
        ? pathname.slice(basePath.length)
        : pathname
      const estEmailOtp = chemin.endsWith("/email-otp/send-verification-otp")

      let corps: CorpsEnvoi = null
      if (estEmailOtp) {
        try {
          corps = (await request.clone().json()) as CorpsEnvoi
        } catch {
          corps = null
        }
      }

      const action = actionPourEnvoi(chemin, corps)
      if (!action) {
        if (estEmailOtp) {
          return refus(
            "Captcha verification failed",
            "VERIFICATION_FAILED",
            403
          )
        }
        return
      }

      return verifierTestDeSecurite({
        requete: request,
        action,
        secretKey,
        allowedHostnames,
      })
    },
  }
}
