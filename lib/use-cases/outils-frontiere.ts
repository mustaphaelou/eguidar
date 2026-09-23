import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Aides partagées des gardes de frontière client/serveur.
 *
 * `lire` résout un chemin relatif contre l'`import.meta.url` du fichier
 * de test appelant — chaque suite garde ainsi ses chemins relatifs à son
 * propre dossier ; `importeDe` détecte un import ou un réexport statique
 * ou dynamique d'un module nommé dans une source ; `sourcesDeProduction`
 * parcourt des arborescences entières pour qu'un fichier neuf ne puisse pas
 * échapper à une garde écrite sur une liste de noms ; `atteignables` suit
 * les imports de valeur de module en module, pour verrouiller ce qu'une
 * surface cliente atteint vraiment et non ce qu'elle importe en un seul saut.
 */
export function lire(depuis: string, relatif: string): string {
  return readFileSync(new URL(relatif, depuis), "utf8")
}

export function importeDe(source: string, module: string): boolean {
  const moduleEchappe = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `(?:import|export)[^;]*from\\s*["'][^"']*${moduleEchappe}["']|` +
      `(?:import|export)\\s+(?:type\\s+)?["'][^"']*${moduleEchappe}["']|` +
      `import\\s*\\(\\s*["'][^"']*${moduleEchappe}["']\\s*\\)`
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

/** Les extensions qu'un spécifieur sans extension peut désigner. */
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

function estServeur(source: string): boolean {
  return /^["']use server["']/m.test(source)
}

/** Les spécifieurs importés pour leur valeur — imports de type exclus. */
function importations(source: string): string[] {
  const specifieurs = [
    ...source.matchAll(
      /(?:^|\n)[ \t]*(?:import|export)[ \t]+(?!type[ \t])([^"']*?)from[ \t]*["']([^"']+)["']/g
    ),
  ].map((correspondance) => correspondance[2])
  for (const correspondance of source.matchAll(
    /(?:^|\n)[ \t]*import[ \t]+["']([^"']+)["']/g
  )) {
    specifieurs.push(correspondance[1])
  }
  for (const correspondance of source.matchAll(
    /import[ \t]*\([ \t]*["']([^"']+)["']/g
  )) {
    specifieurs.push(correspondance[1])
  }
  return specifieurs
}

/** Le chemin de dépôt qu'un spécifieur désigne, ou `null` s'il vient d'un paquet. */
function cible(depuis: string, specifieur: string): string | null {
  if (specifieur.startsWith("@/")) return specifieur.slice(2)
  if (!specifieur.startsWith(".")) return null
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(depuis), specifieur)
  )
}

/** Les voisins de valeur d'un module, résolus et présents dans le dépôt. */
function voisins(
  chemin: string,
  parChemin: ReadonlyMap<string, SourceProduction>
): string[] {
  const source = parChemin.get(chemin)
  if (!source || estServeur(source.source)) return []
  return importations(source.source).flatMap((specifieur) => {
    const base = cible(chemin, specifieur)
    if (base === null) return []
    return EXTENSIONS.map((extension) => `${base}${extension}`).filter(
      (candidat) => parChemin.has(candidat)
    )
  })
}

/**
 * Tous les chemins de dépôt atteints depuis un module par ses imports de
 * valeur, lui compris. Deux arrêts, qui sont ceux du bundler : un import de
 * type est effacé à la compilation, et un module `"use server"` est remplacé
 * côté client par une référence d'action — son graphe reste serveur. Un
 * spécifieur de paquet est ignoré, faute de source dans le dépôt ; `@/` et
 * les chemins relatifs sont résolus de la même façon.
 */
export function atteignables(
  depart: string,
  parChemin: ReadonlyMap<string, SourceProduction>
): Set<string> {
  const atteints = new Set<string>()
  const aVoir = [depart]
  while (aVoir.length > 0) {
    const chemin = aVoir.pop()
    if (chemin === undefined || atteints.has(chemin)) continue
    atteints.add(chemin)
    aVoir.push(...voisins(chemin, parChemin))
  }
  return atteints
}
