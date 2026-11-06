import path from "node:path"

/**
 * L'artefact que la sonde joue : le `standalone` d'un `next build`, jamais un
 * serveur de développement. Il peut vivre ailleurs que dans ce worktree —
 * `E2E_ARTEFACT_DIR` sert à rejouer la sonde sur un artefact construit une
 * seule fois, par exemple pour prouver qu'elle est rouge sur `main`.
 */

export const RACINE = path.resolve(import.meta.dirname, "..", "..")

export const ARTEFACT_PAR_DEFAUT = path.join(RACINE, ".next", "standalone")

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
