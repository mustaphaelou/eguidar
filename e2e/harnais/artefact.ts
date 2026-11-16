import path from "node:path"

export const RACINE = path.resolve(import.meta.dirname, "..", "..")

export const ARTEFACT_PAR_DEFAUT = path.join(RACINE, ".next", "standalone")

export function dossierDArtefact(
  environnement: NodeJS.ProcessEnv = process.env
): string {
  const surcharge = environnement.E2E_ARTEFACT_DIR?.trim()
  if (!surcharge) return ARTEFACT_PAR_DEFAUT
  return path.resolve(RACINE, surcharge)
}

export function racineDeLArtefact(artefact: string): string {
  return path.resolve(artefact, "..", "..")
}

export function fichierDuServeur(artefact: string): string {
  return path.join(artefact, "server.js")
}
