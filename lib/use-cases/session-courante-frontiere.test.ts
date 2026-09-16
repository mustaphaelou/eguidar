import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière client/serveur de la Session courante.
 *
 * Le module est serveur : il lit les en-têtes de la requête et il porte
 * `import "server-only"`. Ni vitest ni la lecture du code ne font lever ce
 * marqueur — seule une garde sur le graphe d'imports verrouille donc « ce
 * module n'entre jamais dans un bundle client », là où
 * `devis-frontiere.test.ts` verrouille la panne inverse.
 *
 * Le parcours part de chaque source `"use client"` de `app/`, `components/`
 * et `lib/` et suit les imports de valeur, module par module — pas une liste
 * de quatre noms : une surface cliente neuve ne peut pas échapper au verrou.
 * Deux arrêts, qui sont ceux du bundler : un import de type est effacé à la
 * compilation, et un module `"use server"` est remplacé côté client par une
 * référence d'action — son graphe reste serveur.
 */
const MODULE = "lib/use-cases/session-courante.ts"

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

function estClient(source: string): boolean {
  return /^["']use client["']/m.test(source)
}

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
  parChemin: Map<string, SourceProduction>
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

/** Le graphe de valeur atteint depuis un module, lui compris. */
function graphe(
  depart: string,
  parChemin: Map<string, SourceProduction>
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

describe("Session courante — frontière client/serveur", () => {
  it("le module est serveur : il porte server-only et la lecture ne refuse pas", () => {
    const source = lire(import.meta.url, "./session-courante.ts")

    expect(source).toMatch(/^import "server-only"$/m)
    expect(source).not.toMatch(/^["']use client["']/m)
    // Le refus est composé par la surface qui l'exige, à partir de
    // `loginUrl` (ADR-0024) : la lecture, elle, n'importe ni le Lien de
    // connexion ni `redirect`.
    expect(importeDe(source, "lien-de-connexion")).toBe(false)
    expect(importeDe(source, "next/navigation")).toBe(false)
  })

  it("aucun composant client n'atteint le module, même par un voisin", () => {
    const sources = sourcesDeProduction(
      import.meta.url,
      "../../app",
      "../../components",
      "../../lib"
    )
    // Parcours non vacuant : les trois arborescences sont visitées.
    expect(sources.length).toBeGreaterThan(200)
    expect(sources.map(({ chemin }) => chemin)).toContain(
      "app/(boutique)/page.tsx"
    )

    const parChemin = new Map(sources.map((source) => [source.chemin, source]))
    const composantsClients = sources.filter(({ source }) => estClient(source))
    // Parcours non vacuant de l'autre côté : les surfaces clientes sont
    // nombreuses et l'une d'elles est connue.
    expect(composantsClients.length).toBeGreaterThan(50)
    expect(composantsClients.map(({ chemin }) => chemin)).toContain(
      "components/storefront/article-du-panier.tsx"
    )

    const atteints = new Set<string>()
    for (const { chemin } of composantsClients) {
      for (const atteint of graphe(chemin, parChemin)) atteints.add(atteint)
    }

    expect(atteints.has(MODULE)).toBe(false)
    // Le parcours suit vraiment les imports : il descend plus loin que les
    // surfaces clientes et atteint un module partagé connu.
    expect(atteints.size).toBeGreaterThan(composantsClients.length)
    expect(atteints.has("lib/carte-produit.ts")).toBe(true)
  })
})
