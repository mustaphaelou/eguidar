import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

/**
 * L'artefact que la sonde joue : le `standalone` d'un `next build`, jamais un
 * serveur de développement. Il peut vivre ailleurs que dans ce worktree —
 * `E2E_ARTEFACT_DIR` sert à rejouer la sonde sur un artefact construit une
 * seule fois, par exemple pour prouver qu'elle est rouge sur `main`.
 */

export const RACINE = path.resolve(import.meta.dirname, "..", "..")

export const ARTEFACT_PAR_DEFAUT = path.join(RACINE, ".next", "standalone")

const DOSSIERS_DE_SOURCE = [
  "app",
  "components",
  "lib",
  "prisma",
  "public",
  "scripts",
  "cache-handlers",
] as const

const FICHIERS_DE_SOURCE = [
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "postcss.config.mjs",
  ".env",
] as const

/** Le dossier du `standalone`, surchargeable par `E2E_ARTEFACT_DIR`. */
export function dossierDArtefact(
  environnement: NodeJS.ProcessEnv = process.env
): string {
  const surcharge = environnement.E2E_ARTEFACT_DIR?.trim()
  if (!surcharge) return ARTEFACT_PAR_DEFAUT
  return path.resolve(RACINE, surcharge)
}

/** La racine du dépôt qui a produit l'artefact (pour `public/` et `cache-handlers/`). */
export function racineDeLArtefact(artefact: string): string {
  return path.resolve(artefact, "..", "..")
}

export function fichierDuServeur(artefact: string): string {
  return path.join(artefact, "server.js")
}

/** La date du build, lue à côté du `standalone` (le `BUILD_ID` de Next). */
export function dateDuBuild(artefact: string): Date | null {
  const buildId = path.join(path.dirname(artefact), "BUILD_ID")
  if (!existsSync(buildId)) return null
  return statSync(buildId).mtime
}

/** Le seul fait qui décide : l'artefact est-il au moins aussi récent que ses sources ? */
export function buildNecessaire(
  dateArtefact: Date | null,
  datesSources: readonly Date[]
): boolean {
  if (dateArtefact === null) return true
  return datesSources.some(
    (dateSource) => dateSource.getTime() > dateArtefact.getTime()
  )
}

function datesDesSources(racine: string): Date[] {
  const dates: Date[] = []
  const visiter = (dossier: string, profondeur: number): void => {
    if (profondeur > 12 || !existsSync(dossier)) return
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = path.join(dossier, entree.name)
      if (entree.isDirectory()) {
        visiter(chemin, profondeur + 1)
      } else if (entree.isFile()) {
        dates.push(statSync(chemin).mtime)
      }
    }
  }
  for (const dossier of DOSSIERS_DE_SOURCE) {
    visiter(path.join(racine, dossier), 0)
  }
  for (const fichier of FICHIERS_DE_SOURCE) {
    const chemin = path.join(racine, fichier)
    if (existsSync(chemin)) dates.push(statSync(chemin).mtime)
  }
  return dates
}

/** Le verdict pour l'artefact courant, avec `E2E_ARTEFACT_DIR` s'il est posé. */
export function buildEstNecessaire(
  artefact: string = dossierDArtefact()
): boolean {
  if (!existsSync(fichierDuServeur(artefact))) return true
  return buildNecessaire(
    dateDuBuild(artefact),
    datesDesSources(racineDeLArtefact(artefact))
  )
}
