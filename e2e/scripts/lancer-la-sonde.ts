import "dotenv/config"

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"

import { dossierDArtefact, fichierDuServeur, RACINE } from "../harnais/artefact"
import { resoudreBaseDeSonde } from "../harnais/base-de-sonde"
import { afficherRedis, resoudreRedisDeSonde } from "../harnais/redis-de-sonde"
import { construireLArtefact, preparerLaBase } from "../harnais/preparation"
import { portLibre } from "../harnais/serveur"

/**
 * `npm run test:e2e` : prépare la base dédiée (migration, semis, image et
 * Commandes de fixture), construit l'artefact **sur cette base**, puis joue
 * Playwright. La base et le build vont de pair : les pages Produit prérendues
 * portent les identifiants de Variante de la base au moment du build, donc une
 * base resemée sans rebuild rendrait l'ajout au Panier impossible.
 *
 * `E2E_SANS_BUILD=1` réutilise l'artefact **et la base** déjà préparés, tels
 * quels (aucune migration, aucun semis). Les arguments après `--` vont à
 * Playwright (`npm run test:e2e -- --grep accueil`).
 *
 * `E2E_ARTEFACT_DIR` vise un artefact construit ailleurs : il exige
 * `E2E_SANS_BUILD=1`, avec la base de ce build.
 */

async function principal(): Promise<void> {
  const baseDeDonnees = resoudreBaseDeSonde()
  const artefact = dossierDArtefact()
  const sansBuild = process.env.E2E_SANS_BUILD === "1"
  const artefactExterne = Boolean(process.env.E2E_ARTEFACT_DIR?.trim())

  console.log(`[sonde] base dédiée : ${baseDeDonnees}`)

  const redis = resoudreRedisDeSonde()
  if (redis === null) {
    console.log("[sonde] aucun Redis déclaré : la sonde tourne sans cache")
  } else {
    console.log(`[sonde] cache applicatif isolé sur ${afficherRedis(redis)}`)
  }

  if (sansBuild && !existsSync(fichierDuServeur(artefact))) {
    throw new Error(
      `E2E_SANS_BUILD=1 mais aucun artefact standalone dans ${artefact} : construisez-le d'abord, ou retirez E2E_SANS_BUILD`
    )
  }
  if (artefactExterne && !sansBuild) {
    throw new Error(
      `E2E_ARTEFACT_DIR (${artefact}) exige E2E_SANS_BUILD=1 : la base doit être celle du build de cet artefact`
    )
  }

  const portDeclare = Number(process.env.E2E_PORT ?? "")
  const port =
    Number.isInteger(portDeclare) && portDeclare > 0
      ? portDeclare
      : await portLibre()
  const origine = `http://127.0.0.1:${port}`

  if (sansBuild) {
    console.log(
      `[sonde] artefact et base réutilisés, préparation et build sautés : ${artefact}`
    )
  } else {
    await preparerLaBase(baseDeDonnees)
    construireLArtefact(baseDeDonnees, origine, redis)
  }

  const cliPlaywright = createRequire(import.meta.url).resolve(
    "@playwright/test/cli"
  )
  const arguments_ = process.argv
    .slice(2)
    .filter((argument) => argument !== "--")
  const resultat = spawnSync(
    process.execPath,
    [cliPlaywright, "test", ...arguments_],
    {
      cwd: RACINE,
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_DATABASE_URL: baseDeDonnees,
        E2E_PORT: String(port),
        ...(redis === null ? {} : { E2E_REDIS_URL: redis }),
      },
    }
  )
  if (resultat.error) throw resultat.error
  process.exitCode = resultat.status ?? 1
}

principal().catch((erreur: unknown) => {
  console.error(`[sonde] ${erreur instanceof Error ? erreur.message : erreur}`)
  process.exitCode = 1
})
