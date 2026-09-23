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

interface ReferenceImport {
  specifier: string
  typeOnly: boolean
}

/** Les références d'import et de réexport vues par les gardes de frontière. */
function referencesDeSource(source: string): ReferenceImport[] {
  const references: ReferenceImport[] = []

  // Import ou réexport avec une clause `from`, y compris multiligne.
  for (const match of source.matchAll(
    /\b(?:import|export)\b[^;]*?\bfrom\s*(["'`])([^"'`]+)\1/g
  )) {
    const clause = match[0].slice(0, match[0].toLowerCase().lastIndexOf("from"))
    references.push({
      specifier: match[2],
      typeOnly: /\b(?:import|export)\s+type\b/.test(clause),
    })
  }

  // Import effet de bord, avec un commentaire éventuel avant le module.
  for (const match of source.matchAll(
    /\bimport\s+(?:\/\*[\s\S]*?\*\/\s*)*(?:type\s+)?(["'`])([^"'`]+)\1/g
  )) {
    references.push({ specifier: match[2], typeOnly: false })
  }

  // Import dynamique : le premier littéral après `import(` est son module.
  // On ne ferme pas volontairement la parenthèse pour accepter les options et
  // les commentaires Webpack/Vite entre le module et la fin de l'appel.
  for (const match of source.matchAll(/\bimport[ \t]*\(/g)) {
    const suite = source.slice((match.index ?? 0) + match[0].length)
    const specifier = suite.match(
      /^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*?(["'`])([^"'`]+)\1/
    )
    if (specifier) {
      references.push({ specifier: specifier[2], typeOnly: false })
    }
  }

  return references
}

function sansExtension(specifier: string): string {
  return specifier.replace(/\.[cm]?[jt]sx?$/, "")
}

function correspondAuModule(specifier: string, module: string): boolean {
  const specifierNormalise = sansExtension(specifier).replace(/^@\//, "")
  const moduleNormalise = sansExtension(module).replace(/^@\//, "")
  if (
    specifierNormalise === moduleNormalise ||
    specifierNormalise.startsWith(`${moduleNormalise}/`) ||
    (moduleNormalise.split("/").length === 1 &&
      specifierNormalise.split("/").pop() === moduleNormalise)
  ) {
    return true
  }

  // Sans le chemin de la source, un spécifier relatif ne peut être résolu
  // qu'à son dernier segment : `./meili` et `../meili` gardent ainsi le même
  // verrou que `@/lib/meili` pour la couture.
  return (
    specifierNormalise.startsWith(".") &&
    specifierNormalise.split("/").pop() === moduleNormalise.split("/").pop()
  )
}

export function importeDe(source: string, module: string): boolean {
  return referencesDeSource(source).some(({ specifier }) =>
    correspondAuModule(specifier, module)
  )
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
  return referencesDeSource(source)
    .filter(({ typeOnly }) => !typeOnly)
    .map(({ specifier }) => specifier)
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
