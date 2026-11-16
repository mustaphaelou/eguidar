import { existsSync, readFileSync } from "node:fs"

import { expect, test } from "./fixtures/sonde"
import {
  FICHIER_DE_SESSION,
  identifiantsDeLaSonde,
  ouvrirUneSessionCourante,
} from "./harnais/session"

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
