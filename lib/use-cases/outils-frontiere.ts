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
 * échapper à une garde écrite sur une liste de noms, et `sourcesToutes`
 * fait le même parcours en y prenant aussi les suites de test, quand la
 * règle vaut pour la recette comme pour la production ; `atteignables` suit
 * les imports de valeur de module en module, pour verrouiller ce qu'une
 * surface cliente atteint vraiment et non ce qu'elle importe en un seul saut ;
 * `directive` dit de quel côté de la frontière une source se réclame, et
 * `empruntsDeValeur` liste ce qu'elle emprunte *pour sa valeur* — l'inverse
 * d'`importeDe`, qui voit les imports de type comme les autres et ne peut
 * donc pas fonder une garde qui les laisse passer.
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

function sourcesSous(dossier: string, avecSuites: boolean): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const enfant = path.join(dossier, entree.name)
    if (entree.isDirectory()) return sourcesSous(enfant, avecSuites)
    if (!/\.tsx?$/.test(entree.name)) return []
    if (!avecSuites && /\.test\.tsx?$/.test(entree.name)) return []
    return [enfant]
  })
}

function collection(
  depuis: string,
  racines: string[],
  avecSuites: boolean
): SourceProduction[] {
  return racines.flatMap((racine) =>
    sourcesSous(fileURLToPath(new URL(racine, depuis)), avecSuites).map(
      (absolu) => ({
        chemin: path
          .relative(fileURLToPath(RACINE_DEPOT), absolu)
          .split(path.sep)
          .join("/"),
        source: readFileSync(absolu, "utf8"),
      })
    )
  )
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
  return collection(depuis, racines, false)
}

/**
 * Les mêmes sources que `sourcesDeProduction`, suites de test comprises —
 * pour une couture dont la règle vaut aussi en recette : le cœur pur du
 * Devis n'a pas d'auteur-test, et une garde qui ne verrait que la
 * production laisserait les tests franchir la porte en saut. Même parcours,
 * mêmes chemins relatifs à la racine du dépôt ; seule l'exclusion des
 * `*.test.*` diffère.
 */
export function sourcesToutes(
  depuis: string,
  ...racines: string[]
): SourceProduction[] {
  return collection(depuis, racines, true)
}

/** Les extensions qu'un spécifieur sans extension peut désigner. */
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

/** Le côté de la frontière qu'une source réclame par sa directive. */
export type Directive = "use client" | "use server"

/**
 * La directive que la source porte en tête — `"use client"`, `"use server"` —
 * ou `null` si elle n'en porte aucune.
 *
 * Une garde de frontière se lit sur la directive, jamais sur le nom du
 * dossier ni sur une convention de nommage : un composant serveur rend
 * volontairement des composants clients, et une garde écrite sur « tout fichier
 * qui n'est pas client » s'allumerait sur ces imports-là, qui sont justes.
 * Ce que la transformation RSC réécrit, c'est ce qu'un module *client* exporte,
 * et elle ne le fait que pour les modules qui le réclament.
 */
export function directive(source: string): Directive | null {
  if (/^["']use client["']/m.test(source)) return "use client"
  if (/^["']use server["']/m.test(source)) return "use server"
  return null
}

/** Le chemin de dépôt qu'un spécifieur désigne, ou `null` s'il vient d'un paquet. */
function cible(depuis: string, specifieur: string): string | null {
  if (specifieur.startsWith("@/")) return specifieur.slice(2)
  if (!specifieur.startsWith(".")) return null
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(depuis), specifieur)
  )
}

/** Un module emprunté pour sa valeur, et le spécifieur qui l'emprunte. */
export interface EmpruntDeValeur {
  /** Chemin du module emprunté, relatif à la racine du dépôt. */
  chemin: string
  /** Le spécifieur tel qu'il est écrit dans la source emprunteuse. */
  specifier: string
}

/**
 * Les modules que `source` emprunte **pour leur valeur**, résolus vers des
 * chemins de dépôt présents dans `parChemin`.
 *
 * C'est le complément d'`importeDe`, qui voit un import de type comme un
 * import de valeur : `referencesDeSource` distingue bien la clause
 * `import type`, `importeDe` jette cette information. Une garde qui doit
 * laisser passer l'emprunt de type — la frontière client/serveur ne se
 * traverse qu'en types, un `import type` étant effacé à la compilation —
 * n'a donc rien à faire d'`importeDe` et fait ici son instruction. Le
 * spécifieur est rendu avec le chemin résolu : une violation se signale par
 * la ligne que le lecteur doit corriger, pas par un chemin déjà normalisé
 * qu'il ne reconnaîtrait pas.
 *
 * Même filtre que `atteignables`, mêmes arrêts : un spécifieur de paquet est
 * ignoré, faute de source dans le dépôt, et un module absent du parcours est
 * ignoré comme résolu trop bas.
 */
export function empruntsDeValeur(
  chemin: string,
  source: string,
  parChemin: ReadonlyMap<string, SourceProduction>
): EmpruntDeValeur[] {
  return referencesDeSource(source).flatMap(({ specifier, typeOnly }) => {
    if (typeOnly) return []
    const base = cible(chemin, specifier)
    if (base === null) return []
    return EXTENSIONS.map((extension) => `${base}${extension}`)
      .filter((candidat) => parChemin.has(candidat))
      .map((candidat) => ({ chemin: candidat, specifier }))
  })
}

/** Les voisins de valeur d'un module, résolus et présents dans le dépôt. */
function voisins(
  chemin: string,
  parChemin: ReadonlyMap<string, SourceProduction>
): string[] {
  const source = parChemin.get(chemin)
  if (!source || directive(source.source) === "use server") return []
  return empruntsDeValeur(chemin, source.source, parChemin).map(
    (emprunt) => emprunt.chemin
  )
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
