import { toNextJsHandler } from "better-auth/next-js"
import { getSessionCookie } from "better-auth/cookies"

import { auth } from "@/lib/auth"
import { rejouerPanierVisiteur } from "@/lib/panier"
import { estPointEntreeConnexion } from "@/lib/points-entree-connexion"
import { revoquerSessionHorsDuree } from "@/lib/session-expiration"

const handlers = toNextJsHandler(auth)

function fusionnerCookies(requete: Headers, reponse: Response): Headers {
  const fusion = new Headers(requete)
  const paires = new Map<string, string>()
  for (const paire of fusion.get("cookie")?.split(";") ?? []) {
    const index = paire.indexOf("=")
    if (index === -1) continue
    paires.set(paire.slice(0, index).trim(), paire.slice(index + 1).trim())
  }
  for (const brut of reponse.headers.getSetCookie()) {
    const [paire] = brut.split(";")
    const index = paire.indexOf("=")
    if (index === -1) continue
    paires.set(paire.slice(0, index).trim(), paire.slice(index + 1).trim())
  }
  if (paires.size > 0) {
    fusion.set(
      "cookie",
      [...paires].map(([nom, valeur]) => `${nom}=${valeur}`).join("; ")
    )
  }
  return fusion
}

async function purgerSessionHorsDuree(requete: Request): Promise<void> {
  if (!getSessionCookie(requete)) return

  const session = await auth.api.getSession({ headers: requete.headers })
  if (session) await revoquerSessionHorsDuree(session)
}

async function traiterAvecRejou(
  traiter: (requete: Request) => Promise<Response>,
  requete: Request
): Promise<Response> {
  await purgerSessionHorsDuree(requete)
  const reponse = await traiter(requete)
  const { pathname } = new URL(requete.url)
  if (!estPointEntreeConnexion(requete.method, pathname)) return reponse
  try {
    const session = await auth.api.getSession({
      headers: fusionnerCookies(requete.headers, reponse),
    })
    if (session?.user) await rejouerPanierVisiteur(session.user.id)
  } catch {}
  return reponse
}

export async function GET(requete: Request): Promise<Response> {
  return traiterAvecRejou(handlers.GET, requete)
}

export async function POST(requete: Request): Promise<Response> {
  return traiterAvecRejou(handlers.POST, requete)
}
