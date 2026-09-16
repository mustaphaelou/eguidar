import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Aides partagées des gardes de frontière client/serveur.
 *
 * `lire` résout un chemin relatif contre l'`import.meta.url` du fichier
 * de test appelant — chaque suite garde ainsi ses chemins relatifs à son
 * propre dossier ; `importeDe` détecte un import ou un réexport statique
 * d'un module nommé dans une source ; `sourcesDeProduction` parcourt des
 * arborescences entières pour qu'un fichier neuf ne puisse pas échapper à
 * une garde écrite sur une liste de noms.
 */
export function lire(depuis: string, relatif: string): string {
  return readFileSync(new URL(relatif, depuis), "utf8")
}

export function importeDe(source: string, module: string): boolean {
  return new RegExp(
    `(?:import|export)[^;]*from\\s*["'][^"']*${module}["']`
  ).test(source)
}

export interface SourceProduction {
  /** Chemin relatif à la racine du dépôt, par exemple `lib/carte-produit.ts`. */
  chemin: string
  source: string
}

/** Racine du dépôt, vue depuis `lib/use-cases/`. */
const RACINE_DEPOT = new URL("../../", import.meta.url)

function sourcesSous(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const enfant = path.join(dossier, entree.name)
    if (entree.isDirectory()) return sourcesSous(enfant)
    if (!/\.tsx?$/.test(entree.name) || /\.test\.tsx?$/.test(entree.name)) {
      return []
    }
    return [enfant]
  })
}

/**
 * Toutes les sources de production (`.ts`/`.tsx`, suites `*.test.*` exclues)
 * des arborescences données — chacune avec son chemin relatif à la racine du
 * dépôt et son contenu. Le parcours descend dans chaque sous-dossier sans en
 * sauter aucun ; l'appelant prouve qu'il n'est pas vide (nombre de sources
 * visitées, présence d'un fichier connu) pour qu'une garde ne puisse pas
 * passer parce qu'une racine a disparu.
 */
export function sourcesDeProduction(
  depuis: string,
  ...racines: string[]
): SourceProduction[] {
  return racines.flatMap((racine) =>
    sourcesSous(fileURLToPath(new URL(racine, depuis))).map((absolu) => ({
      chemin: path
        .relative(fileURLToPath(RACINE_DEPOT), absolu)
        .split(path.sep)
        .join("/"),
      source: readFileSync(absolu, "utf8"),
    }))
  )
}
