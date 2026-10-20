import { describe, expect, it } from "vitest"

import {
  avecSource,
  carte,
  directive,
  empruntsDeValeur,
  importeDe,
  sourceApres,
  sourceDuCorpus,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const RECHERCHE = "lib/use-cases/search.ts"
const BARRE_LATERALE = "components/storefront/search-filters.tsx"
const SUGGESTIONS = "components/storefront/search-suggestions.tsx"
const RESULTATS = "components/storefront/search-results.tsx"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
)

function clients(sources: readonly SourceProduction[]): SourceProduction[] {
  return sources.filter(({ source }) => directive(source) === "use client")
}

function empruntsVersRecherche(
  chemin: string,
  source: string,
  corpus: ReadonlyMap<string, SourceProduction>
): string[] {
  return empruntsDeValeur(chemin, source, corpus)
    .filter(({ chemin: cible }) => cible === RECHERCHE)
    .map(({ specifieur }) => specifieur)
}

function fautifs(sources: readonly SourceProduction[]): string[] {
  const corpus = carte(sources)
  return clients(sources)
    .filter(
      ({ chemin, source }) =>
        empruntsVersRecherche(chemin, source, corpus).length > 0
    )
    .map(({ chemin }) => chemin)
}

describe("la couture de la Recherche — frontière client/serveur", () => {
  it("le corpus est réel, et deux surfaces client atteignent la couture", () => {
    const corpus = carte(SOURCES)

    expect(SOURCES.length).toBeGreaterThan(200)
    expect(corpus.has(RECHERCHE)).toBe(true)
    expect(clients(SOURCES).map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([BARRE_LATERALE, SUGGESTIONS])
    )

    for (const chemin of [BARRE_LATERALE, SUGGESTIONS]) {
      const { source } = sourceDuCorpus(SOURCES, chemin)
      expect(directive(source), chemin).toBe("use client")
      expect(importeDe(source, "lib/use-cases/search"), chemin).toBe(true)
      expect(
        empruntsVersRecherche(chemin, source, corpus),
        `${chemin} n'emprunte que des types`
      ).toEqual([])
    }

    expect(fautifs(SOURCES)).toEqual([])
  })

  it("le module mince a disparu du corpus", () => {
    expect(carte(SOURCES).has("lib/options-de-filtre.ts")).toBe(false)
  })

  it("la couture n'exporte pas ses assembleurs et garde ses types", () => {
    const { source } = sourceDuCorpus(SOURCES, RECHERCHE)
    const exports = source
      .split("\n")
      .filter((ligne) => ligne.startsWith("export"))
      .join("\n")

    expect(exports).not.toMatch(/\bassembler/)
    for (const type of [
      "OptionDeFiltre",
      "OptionsDeFiltre",
      "RepartitionsDeFacettes",
    ]) {
      expect(exports).toContain(type)
    }
    expect(importeDe(source, "lib/options-de-filtre")).toBe(false)
  })

  it("échoue sur un emprunt de valeur planté dans une vraie surface client", () => {
    const barre = sourceDuCorpus(SOURCES, BARRE_LATERALE)
    const viole = sourceApres(
      barre.source,
      'import { searchProducts } from "@/lib/use-cases/search"'
    )
    const modifie = avecSource(SOURCES, BARRE_LATERALE, viole)

    expect(fautifs(modifie)).toEqual([BARRE_LATERALE])
  })

  it("n'échoue ni sur un import type planté, ni sur la suggestion réelle", () => {
    const barre = sourceDuCorpus(SOURCES, BARRE_LATERALE)
    const typeSeul = sourceApres(
      barre.source,
      'import type { OptionsDeFiltre } from "@/lib/use-cases/search"'
    )
    const modifie = avecSource(SOURCES, BARRE_LATERALE, typeSeul)

    expect(importeDe(typeSeul, "lib/use-cases/search")).toBe(true)
    expect(
      empruntsVersRecherche(BARRE_LATERALE, typeSeul, carte(modifie))
    ).toEqual([])
    expect(fautifs(modifie)).toEqual([])

    const suggestions = sourceDuCorpus(SOURCES, SUGGESTIONS)
    expect(directive(suggestions.source)).toBe("use client")
    expect(importeDe(suggestions.source, "lib/use-cases/search")).toBe(true)
    expect(
      empruntsVersRecherche(SUGGESTIONS, suggestions.source, carte(SOURCES))
    ).toEqual([])
  })

  it("laisse un composant serveur emprunter buildSearchHref", () => {
    const { source } = sourceDuCorpus(SOURCES, RESULTATS)

    expect(directive(source)).toBeNull()
    expect(importeDe(source, "lib/use-cases/search")).toBe(true)
    expect(empruntsVersRecherche(RESULTATS, source, carte(SOURCES))).toContain(
      "@/lib/use-cases/search"
    )
    expect(fautifs(SOURCES)).not.toContain(RESULTATS)
  })
})
