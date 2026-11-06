import { existsSync, readFileSync } from "node:fs"

import { expect, test } from "./fixtures/sonde"
import {
  FICHIER_DE_SESSION,
  identifiantsDeLaSonde,
  ouvrirUneSessionCourante,
} from "./harnais/session"

/**
 * Le projet « preparation » de `playwright.config.ts` : la Session courante est
 * ouverte **une fois** par l'exécution, par l'endpoint de connexion de
 * l'application, puis son état Playwright est enregistré pour les cas qui
 * suivent. Ce fichier ne s'appelle pas `.spec.ts` : il ne fait pas partie de la
 * sonde elle-même.
 */
test("enregistre l'état de la Session courante", async ({ page, serveur }) => {
  const identifiants = identifiantsDeLaSonde()
  const session = await ouvrirUneSessionCourante(
    page,
    serveur.origine,
    identifiants
  )

  expect(session.statut).toBe(200)
  expect(session.email).toBe(identifiants.email)
  expect(session.fichier).toBe(FICHIER_DE_SESSION)
  expect(existsSync(FICHIER_DE_SESSION)).toBe(true)

  const etat = JSON.parse(readFileSync(FICHIER_DE_SESSION, "utf8")) as {
    cookies?: Array<{ name?: string }>
  }
  expect(etat.cookies?.length ?? 0).toBeGreaterThan(0)
})
