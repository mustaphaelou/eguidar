import { randomBytes } from "node:crypto"

import {
  supprimerDonneesFacebook,
  verifierSignedRequest,
} from "@/lib/suppression-donnees-facebook"

const MESSAGE_SIGNATURE_REFUSEE = "Signature du signed_request invalide."
const MESSAGE_INDISPONIBLE = "La suppression des données est indisponible."

const ENTETES_SANS_CACHE = { "cache-control": "no-store" } as const

function reponseJson(corps: Record<string, unknown>, status: number): Response {
  return Response.json(corps, {
    status,
    headers: ENTETES_SANS_CACHE,
  })
}

async function lireSignedRequest(request: Request): Promise<string | null> {
  const typeDeContenu = request.headers.get("content-type") ?? ""

  if (typeDeContenu.includes("application/json")) {
    try {
      const corps: unknown = await request.json()
      if (typeof corps !== "object" || corps === null) return null

      const signedRequest = (corps as Record<string, unknown>).signed_request
      return typeof signedRequest === "string" ? signedRequest : null
    } catch {
      return null
    }
  }

  try {
    const formulaire = await request.formData()
    const signedRequest = formulaire.get("signed_request")
    return typeof signedRequest === "string" ? signedRequest : null
  } catch {
    return null
  }
}

function origineDeLEspace(): string | null {
  const base =
    process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL
  if (base === undefined || base === "") return null

  try {
    return new URL(base).origin
  } catch {
    return null
  }
}

function urlDeStatut(request: Request, code: string): string {
  const origine = origineDeLEspace() ?? new URL(request.url).origin
  const url = new URL("/suppression-donnees", origine)
  url.searchParams.set("code", code)
  return url.toString()
}

export async function POST(request: Request): Promise<Response> {
  // Le secret est lu à l'appel : les tests peuvent le poser sans recharger le
  // module, et une rotation d'environnement n'exige pas de redémarrage du code.
  const secret = process.env.FACEBOOK_CLIENT_SECRET
  if (secret === undefined || secret === "") {
    console.error(
      "[facebook] FACEBOOK_CLIENT_SECRET absent — suppression impossible"
    )
    return reponseJson({ error: MESSAGE_INDISPONIBLE }, 500)
  }

  const signedRequest = await lireSignedRequest(request)
  if (signedRequest === null) {
    return reponseJson({ error: MESSAGE_SIGNATURE_REFUSEE }, 403)
  }

  const charge = verifierSignedRequest(signedRequest, secret)
  if (charge === null) {
    return reponseJson({ error: MESSAGE_SIGNATURE_REFUSEE }, 403)
  }

  try {
    await supprimerDonneesFacebook(charge.user_id)
  } catch (error) {
    console.error(
      "[facebook] la suppression des données a échoué",
      error instanceof Error ? error.name : "erreur inconnue"
    )
    return reponseJson({ error: MESSAGE_INDISPONIBLE }, 500)
  }

  const confirmation_code = randomBytes(16).toString("hex")
  return reponseJson(
    {
      url: urlDeStatut(request, confirmation_code),
      confirmation_code,
    },
    200
  )
}
