import { mkdirSync } from "node:fs"
import path from "node:path"

import type { Page } from "@playwright/test"

import {
  identifiantsCompteAdmin,
  type IdentifiantsCompteAdmin,
} from "../../prisma/compte-admin"
import { RACINE } from "./artefact"

/**
 * La Session courante de la sonde, ouverte une fois et réutilisée.
 *
 * La sonde se connecte **par l'endpoint de connexion de l'application**, depuis
 * la page, avec le compte administrateur semé : pas par le formulaire, pas par
 * le widget Turnstile. Le serveur de la sonde retire `TURNSTILE_SECRET_KEY` de
 * son environnement (voir `environnementDuServeur`), donc le plugin de Test de
 * sécurité n'est pas enregistré et l'endpoint accepte la connexion.
 *
 * Le fichier `e2e/.auth/session-courante.json` est l'état Playwright
 * (`storageState`) que les cas réutilisent :
 *
 * ```ts
 * // e2e/session.setup.ts, projet « preparation » de playwright.config.ts
 * const session = await ouvrirUneSessionCourante(page, serveur.origine)
 *
 * // e2e/quelque-chose.spec.ts, joué après la préparation
 * test.use({ storageState: FICHIER_DE_SESSION })
 * ```
 *
 * Les cas anonymes (Panier visiteur) n'importent pas ce module et gardent un
 * contexte sans session.
 */

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

/** Les identifiants du compte administrateur semé, lus dans l'environnement. */
export function identifiantsDeLaSonde(
  environnement: Record<string, string | undefined> = process.env
): IdentifiantsCompteAdmin {
  return identifiantsCompteAdmin(environnement)
}

export interface SessionOuverte {
  /** L'état enregistré, à passer à `storageState`. */
  fichier: string
  /** L'adresse du compte connecté, telle que l'endpoint de Session la rend. */
  email: string
  /** Le statut HTTP de la connexion : la sonde exige 200. */
  statut: number
}

function échouer(message: string): never {
  throw new Error(`[sonde] ${message}`)
}

/**
 * Ouvre la Session sur `page` et enregistre son état. Vérifie que la connexion
 * renvoie 200 **et** que `/api/auth/get-session` rend bien le compte attendu :
 * un cookie posé sans session ne passerait pas.
 */
export async function ouvrirUneSessionCourante(
  page: Page,
  origine: string,
  identifiants: IdentifiantsCompteAdmin = identifiantsDeLaSonde()
): Promise<SessionOuverte> {
  // Une page de l'application est nécessaire pour que `fetch` parte de son
  // origine et emporte l'`Origin` que la bibliothèque vérifie.
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
