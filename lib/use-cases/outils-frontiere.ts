import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function lire(depuis: string, relatif: string): string {
  return readFileSync(new URL(relatif, depuis), "utf8")
}

interface ReferenceImport {
  specifieur: string
  typeOnly: boolean
}

function referencesDeSource(source: string): ReferenceImport[] {
  const references: ReferenceImport[] = []

  for (const match of source.matchAll(
    /\b(?:import|export)\b[^;]*?\bfrom\s*(["'`])([^"'`]+)\1/g
  )) {
    const clause = match[0].slice(0, match[0].toLowerCase().lastIndexOf("from"))
    references.push({
      specifieur: match[2],
      typeOnly: /\b(?:import|export)\s+type\b/.test(clause),
    })
  }

  for (const match of source.matchAll(
    /\bimport\s+(?:\/\*[\s\S]*?\*\/\s*)*(?:type\s+)?(["'`])([^"'`]+)\1/g
  )) {
    references.push({ specifieur: match[2], typeOnly: false })
  }

  for (const match of source.matchAll(/\bimport[ \t]*\(/g)) {
    const suite = source.slice((match.index ?? 0) + match[0].length)
    const specifieur = suite.match(
      /^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*?(["'`])([^"'`]+)\1/
    )
    if (specifieur) {
      references.push({ specifieur: specifieur[2], typeOnly: false })
    }
  }

  return references
}

function sansExtension(specifieur: string): string {
  return specifieur.replace(/\.[cm]?[jt]sx?$/, "")
}

function correspondAuModule(specifieur: string, module: string): boolean {
  const specifieurNormalise = sansExtension(specifieur).replace(/^@\//, "")
  const moduleNormalise = sansExtension(module).replace(/^@\//, "")
  if (
    specifieurNormalise === moduleNormalise ||
    specifieurNormalise.startsWith(`${moduleNormalise}/`) ||
    (moduleNormalise.split("/").length === 1 &&
      specifieurNormalise.split("/").pop() === moduleNormalise)
  ) {
    return true
  }

  return (
    specifieurNormalise.startsWith(".") &&
    specifieurNormalise.split("/").pop() === moduleNormalise.split("/").pop()
  )
}

function resoluDepuis(specifieur: string, depuis: string): string {
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(depuis), specifieur)
  )
}

export function importeDe(
  source: string,
  module: string,
  depuis?: string
): boolean {
  return referencesDeSource(source).some(({ specifieur }) =>
    correspondAuModule(
      depuis !== undefined && specifieur.startsWith(".")
        ? resoluDepuis(specifieur, depuis)
        : specifieur,
      module
    )
  )
}

export interface SourceProduction {
  chemin: string
  source: string
}

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

export function sourcesDeProduction(
  depuis: string,
  ...racines: string[]
): SourceProduction[] {
  return collection(depuis, racines, false)
}

export function sourcesToutes(
  depuis: string,
  ...racines: string[]
): SourceProduction[] {
  return collection(depuis, racines, true)
}

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

export type Directive = "use client" | "use server"

const PREAMBULE = /^(?:\s+|#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/

const PROLOGUE = /^(?:\s*(["'])[^"'\n]*\1\s*;?)*/

export function directive(source: string): Directive | null {
  const prologue = source.replace(PREAMBULE, "").match(PROLOGUE)?.[0] ?? ""
  const reclamation = prologue.match(/([\"'])(use client|use server)\1/)
  return (reclamation?.[2] as Directive | undefined) ?? null
}

function cible(depuis: string, specifieur: string): string | null {
  if (specifieur.startsWith("@/")) return specifieur.slice(2)
  if (!specifieur.startsWith(".")) return null
  return path.posix.normalize(
    path.posix.join(path.posix.dirname(depuis), specifieur)
  )
}

export interface EmpruntDeValeur {
  chemin: string
  specifieur: string
}

export function empruntsDeValeur(
  chemin: string,
  source: string,
  parChemin: ReadonlyMap<string, SourceProduction>
): EmpruntDeValeur[] {
  return referencesDeSource(source).flatMap(({ specifieur, typeOnly }) => {
    if (typeOnly) return []
    const base = cible(chemin, specifieur)
    if (base === null) return []
    return EXTENSIONS.map((extension) => `${base}${extension}`)
      .filter((candidat) => parChemin.has(candidat))
      .map((candidat) => ({ chemin: candidat, specifieur }))
  })
}

export function carte(
  sources: readonly SourceProduction[]
): Map<string, SourceProduction> {
  return new Map(sources.map((source) => [source.chemin, source]))
}

export function carteDe(
  ...paires: [string, string][]
): Map<string, SourceProduction> {
  return carte(paires.map(([chemin, source]) => ({ chemin, source })))
}

export function sourceDuCorpus(
  sources: readonly SourceProduction[],
  chemin: string
): SourceProduction {
  const trouvee = sources.find(({ chemin: nominee }) => nominee === chemin)
  if (!trouvee) throw new Error(`Source absente du corpus : ${chemin}`)
  return trouvee
}

export function sourceApres(source: string, ligne: string): string {
  const premiere = source.split("\n")[0]!
  return `${premiere}\n${ligne}\n${source.slice(premiere.length)}`
}

export function avecSources(
  sources: readonly SourceProduction[],
  ...remplacements: SourceProduction[]
): SourceProduction[] {
  const remplaces = new Map(
    remplacements.map(({ chemin, source }) => [chemin, source])
  )
  return sources.map((entree) => {
    const source = remplaces.get(entree.chemin)
    return source === undefined ? entree : { chemin: entree.chemin, source }
  })
}

export function avecSource(
  sources: readonly SourceProduction[],
  chemin: string,
  source: string
): SourceProduction[] {
  return avecSources(sources, { chemin, source })
}

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
