import { mkdirSync } from "node:fs"
import path from "node:path"

import type { Page } from "@playwright/test"

import {
  identifiantsCompteAdmin,
  type IdentifiantsCompteAdmin,
} from "../../prisma/compte-admin"
import { RACINE } from "./artefact"

export const DOSSIER_DE_SESSION = path.join(RACINE, "e2e", ".auth")

export const FICHIER_DE_SESSION = path.join(
  DOSSIER_DE_SESSION,
  "session-courante.json"
)

export function adresseDeConnexion(origine: string): string {
  return new URL("/api/auth/sign-in/email", origine).toString()
}

export function adresseDeLaSession(origine: string): string {
  return new URL("/api/auth/get-session", origine).toString()
}

export function identifiantsDeLaSonde(
  environnement: Record<string, string | undefined> = process.env
): IdentifiantsCompteAdmin {
  return identifiantsCompteAdmin(environnement)
}

export interface SessionOuverte {
  fichier: string
  email: string
  statut: number
}

function échouer(message: string): never {
  throw new Error(`[sonde] ${message}`)
}

export async function ouvrirUneSessionCourante(
  page: Page,
  origine: string,
  identifiants: IdentifiantsCompteAdmin = identifiantsDeLaSonde()
): Promise<SessionOuverte> {
  await page.goto(`${origine}/faq`, { waitUntil: "domcontentloaded" })

  const connexion = await page.evaluate(
    async ({ adresse, email, motDePasse }) => {
      const reponse = await fetch(adresse, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: motDePasse }),
      })
      return { statut: reponse.status, corps: await reponse.text() }
    },
    {
      adresse: adresseDeConnexion(origine),
      email: identifiants.email,
      motDePasse: identifiants.motDePasse,
    }
  )

  if (connexion.statut !== 200) {
    échouer(
      `la connexion par l'endpoint a échoué (${connexion.statut}) : ${connexion.corps}. ` +
        "Le serveur de la sonde doit tourner sans TURNSTILE_SECRET_KEY, et ADMIN_EMAIL/ADMIN_PASSWORD doivent être ceux du semis."
    )
  }

  const session = await page.evaluate(async (adresse) => {
    const reponse = await fetch(adresse)
    if (!reponse.ok) return null
    const corps = (await reponse.json()) as {
      user?: { email?: string }
    } | null
    return corps?.user?.email ?? null
  }, adresseDeLaSession(origine))

  if (session !== identifiants.email) {
    échouer(
      `l'endpoint de Session ne rend pas le compte « ${identifiants.email} » après connexion (${session ?? "aucune session"}).`
    )
  }

  mkdirSync(DOSSIER_DE_SESSION, { recursive: true })
  await page.context().storageState({ path: FICHIER_DE_SESSION })

  return {
    fichier: FICHIER_DE_SESSION,
    email: identifiants.email,
    statut: connexion.statut,
  }
}
