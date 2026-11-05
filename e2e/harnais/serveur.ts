import "dotenv/config"

import { spawn, type ChildProcess } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Readable } from "node:stream"

import {
  dossierDArtefact,
  fichierDuServeur,
  racineDeLArtefact,
} from "./artefact"

/**
 * Le serveur de la sonde : l'artefact `standalone` copié comme le fait le
 * Dockerfile (standalone, static, public, handlers), démarré sur un port libre,
 * interrogé jusqu'à sa première page, puis arrêté et effacé. Aucune pause fixe :
 * on attend une réponse, pas un délai.
 */

export interface ServeurDeSonde {
  origine: string
  arreter(): Promise<void>
}

const DELAI_DE_BOOT_MS = 90_000
const INTERVALLE_DE_SONDE_MS = 250

export async function portLibre(): Promise<number> {
  const sonde = createServer()
  await new Promise<void>((resoudre, rejeter) => {
    sonde.once("error", rejeter)
    sonde.listen(0, "127.0.0.1", () => resoudre())
  })
  const adresse = sonde.address()
  await new Promise<void>((resoudre, rejeter) => {
    sonde.close((erreur) => (erreur ? rejeter(erreur) : resoudre()))
  })
  if (adresse === null || typeof adresse === "string") {
    throw new Error("le port libre choisi est illisible")
  }
  return adresse.port
}

/** Le même arrangement que le Dockerfile et la sonde de document anonyme. */
function copierLArtefact(artefact: string): string {
  if (!existsSync(fichierDuServeur(artefact))) {
    throw new Error(
      `artefact standalone absent (${artefact}) : lancez \`npm run test:e2e\` ou \`npm run build\`, ou pointez E2E_ARTEFACT_DIR sur un artefact déjà construit`
    )
  }
  const racine = racineDeLArtefact(artefact)
  const dossier = mkdtempSync(path.join(tmpdir(), "eguidar-sonde-"))
  const standalone = path.join(dossier, "standalone")
  cpSync(artefact, standalone, { recursive: true })
  cpSync(
    path.join(path.dirname(artefact), "static"),
    path.join(standalone, ".next", "static"),
    { recursive: true }
  )
  cpSync(path.join(racine, "public"), path.join(standalone, "public"), {
    recursive: true,
  })
  cpSync(
    path.join(racine, "cache-handlers"),
    path.join(standalone, "cache-handlers"),
    { recursive: true }
  )
  return standalone
}

function environnementDuServeur(
  origine: string,
  baseDeDonnees: string
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: new URL(origine).port,
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: baseDeDonnees,
    BETTER_AUTH_URL: origine,
    NEXT_PUBLIC_BETTER_AUTH_URL: origine,
    // La condition du plugin de Test de sécurité : absent, il n'est pas
    // enregistré. Une valeur vide le neutralise même si un `.env` traîne dans
    // l'artefact (Next copie les fichiers d'environnement dans le standalone).
    TURNSTILE_SECRET_KEY: "",
    NEXT_TELEMETRY_DISABLED: "1",
  }
}

function retenirLeJournal(journal: string[], flux: Readable | null): void {
  flux?.setEncoding("utf8")
  flux?.on("data", (morceau: string) => {
    journal.push(...morceau.split("\n").filter((ligne) => ligne !== ""))
    if (journal.length > 80) journal.splice(0, journal.length - 80)
  })
}

async function attendreLeServeur(
  origine: string,
  serveur: ChildProcess,
  journal: readonly string[]
): Promise<void> {
  const echeance = Date.now() + DELAI_DE_BOOT_MS
  while (Date.now() < echeance) {
    if (serveur.exitCode !== null) {
      throw new Error(
        `le serveur de la sonde s'est arrêté au démarrage (code ${serveur.exitCode})\n${journal.join("\n")}`
      )
    }
    try {
      const reponse = await fetch(`${origine}/faq`, { redirect: "manual" })
      await reponse.arrayBuffer()
      if (reponse.status === 200) return
    } catch {
      // Le serveur n'écoute pas encore.
    }
    await new Promise((resoudre) =>
      setTimeout(resoudre, INTERVALLE_DE_SONDE_MS)
    )
  }
  throw new Error(
    `pas de 200 sur /faq en ${DELAI_DE_BOOT_MS} ms\n${journal.join("\n")}`
  )
}

/**
 * Démarre l'artefact sur `E2E_PORT` s'il est posé, sinon sur un port libre.
 * Un échec lève : la sonde échoue, elle ne se saute jamais.
 */
export async function demarrerLeServeur(options: {
  baseDeDonnees: string
  artefact?: string
}): Promise<ServeurDeSonde> {
  const artefact = options.artefact ?? dossierDArtefact()
  const standalone = copierLArtefact(artefact)
  const portDeclare = Number(process.env.E2E_PORT ?? "")
  const port =
    Number.isInteger(portDeclare) && portDeclare > 0
      ? portDeclare
      : await portLibre()
  const origine = `http://127.0.0.1:${port}`

  const journal: string[] = []
  const serveur = spawn(process.execPath, ["server.js"], {
    cwd: standalone,
    env: environnementDuServeur(origine, options.baseDeDonnees),
    stdio: ["ignore", "pipe", "pipe"],
  })
  retenirLeJournal(journal, serveur.stdout)
  retenirLeJournal(journal, serveur.stderr)

  let arrete = false
  const arreter = async (): Promise<void> => {
    if (arrete) return
    arrete = true
    if (serveur.exitCode === null) {
      serveur.kill("SIGKILL")
      await new Promise<void>((resoudre) => {
        if (serveur.exitCode !== null) return resoudre()
        serveur.once("exit", () => resoudre())
        setTimeout(resoudre, 5_000).unref()
      })
    }
    rmSync(path.dirname(standalone), { recursive: true, force: true })
  }

  try {
    await attendreLeServeur(origine, serveur, journal)
  } catch (erreur) {
    await arreter()
    throw erreur
  }

  return { origine, arreter }
}

/** Le build de la sonde : la base de sonde, l'origine du future serveur, sans Turnstile. */
export function environnementDeBuild(
  baseDeDonnees: string,
  origine: string
): NodeJS.ProcessEnv {
  const environnement: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: baseDeDonnees,
    BETTER_AUTH_URL: origine,
    // Le client d'authentification retombe sur l'origine de la fenêtre : la
    // sonde garde son port libre sans rejouer le build.
    NEXT_PUBLIC_BETTER_AUTH_URL: "",
    NEXT_TELEMETRY_DISABLED: "1",
  }
  delete environnement.TURNSTILE_SECRET_KEY
  return environnement
}
