import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@/lib/auth"
import { rejouerPanierVisiteur } from "@/lib/panier"

const handlers = toNextJsHandler(auth)

function estTentativeConnexion(methode: string, chemin: string): boolean {
  return (
    (methode === "POST" && chemin.endsWith("/sign-in/email")) ||
    (methode === "GET" && chemin.includes("/callback/"))
  )
}

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

async function traiterAvecRejou(
  traiter: (requete: Request) => Promise<Response>,
  requete: Request
): Promise<Response> {
  const reponse = await traiter(requete)
  const { pathname } = new URL(requete.url)
  if (!estTentativeConnexion(requete.method, pathname)) return reponse
  try {
    const session = await auth.api.getSession({
      headers: fusionnerCookies(requete.headers, reponse),
    })
    if (session?.user) await rejouerPanierVisiteur(session.user.id)
  } catch {
    // Le rejou du Panier Visiteur ne doit jamais bloquer l'authentification.
  }
  return reponse
}

export async function GET(requete: Request): Promise<Response> {
  return traiterAvecRejou(handlers.GET, requete)
}

export async function POST(requete: Request): Promise<Response> {
  return traiterAvecRejou(handlers.POST, requete)
}
