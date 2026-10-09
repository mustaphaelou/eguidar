import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { load } from "js-yaml"

const RACINE = path.resolve(import.meta.dirname, "..")

export const FLUX = path.join(RACINE, ".github", "workflows", "ci.yml")

const COMMANDES_NPM_DINSTALLATION = new Set(["ci", "install", "i"])

const FORME_NPM = /\bnpm\s+(?:run\s+)?([a-z][\w:.-]*)/g

export function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

export function extraireLesChecks(commandes: readonly string[]): string[] {
  const nommes = commandes.flatMap((commande) =>
    [...commande.matchAll(FORME_NPM)].map((trouve) => trouve[1])
  )
  return [
    ...new Set(nommes.filter((nom) => !COMMANDES_NPM_DINSTALLATION.has(nom))),
  ]
}

function commandesRun(job: Record<string, unknown>): string[] {
  return (job.steps as unknown[])
    .filter(estObjet)
    .map((etape) => etape.run)
    .filter((run): run is string => typeof run === "string")
}

export function exigerDesJobsLus(
  flux: unknown,
  source: string
): Map<string, Record<string, unknown>> {
  const jobs = estObjet(flux) ? flux.jobs : null
  if (!estObjet(jobs)) {
    throw new Error(`${source} : clé \`jobs\` absente ou illisible`)
  }

  const lus = new Map<string, Record<string, unknown>>()
  for (const [nom, job] of Object.entries(jobs)) {
    if (!estObjet(job) || !Array.isArray(job.steps)) {
      throw new Error(`${source} : le job \`${nom}\` n'a pas d'étapes`)
    }
    if (commandesRun(job).length === 0) {
      throw new Error(
        `${source} : le job \`${nom}\` n'a aucune étape qui porte une commande`
      )
    }
    lus.set(nom, job)
  }
  return lus
}

export function lireLesJobs(): Map<string, Record<string, unknown>> {
  return exigerDesJobsLus(load(readFileSync(FLUX, "utf8")), FLUX)
}

export function checksParJob(): Map<string, string[]> {
  return new Map(
    [...lireLesJobs()].map(([nom, job]) => [
      nom,
      extraireLesChecks(commandesRun(job)),
    ])
  )
}

export function checksDuFlux(): string[] {
  const vus = new Set<string>()
  const checks: string[] = []
  for (const duJob of checksParJob().values()) {
    for (const nom of duJob) {
      if (vus.has(nom)) continue
      vus.add(nom)
      checks.push(nom)
    }
  }
  return checks
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(`${checksDuFlux().join("\n")}\n`)
  } catch (erreur) {
    process.stderr.write(`${(erreur as Error).message}\n`)
    process.exit(1)
  }
}
