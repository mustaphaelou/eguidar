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
  it("le corpus est réel, et les deux surfaces client de la Recherche y figurent", () => {
    const corpus = carte(SOURCES)

    expect(SOURCES.length).toBeGreaterThan(200)
    expect(corpus.has(RECHERCHE)).toBe(true)
    expect(clients(SOURCES).map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([BARRE_LATERALE, SUGGESTIONS])
    )

    for (const chemin of [BARRE_LATERALE, SUGGESTIONS]) {
      const { source } = sourceDuCorpus(SOURCES, chemin)
      expect(directive(source), chemin).toBe("use client")
      expect(
        empruntsVersRecherche(chemin, source, corpus),
        `${chemin} n'emprunte aucune valeur au serveur`
      ).toEqual([])
    }

    expect(fautifs(SOURCES)).toEqual([])
  })

  it("la barre latérale n'emprunte rien à la couture, ni valeur ni type", () => {
    const { source } = sourceDuCorpus(SOURCES, BARRE_LATERALE)

    expect(importeDe(source, "lib/use-cases/search")).toBe(false)
    expect(importeDe(source, "lib/filtre-de-recherche")).toBe(true)
    expect(importeDe(source, "lib/search-params")).toBe(true)
  })

  it("la suggestion n'emprunte à la couture que des types, et ne redéclare pas la catégorie", () => {
    const { source } = sourceDuCorpus(SOURCES, SUGGESTIONS)

    expect(importeDe(source, "lib/use-cases/search")).toBe(true)
    expect(empruntsVersRecherche(SUGGESTIONS, source, carte(SOURCES))).toEqual(
      []
    )
    expect(source).not.toMatch(/\binterface\s+SuggestionCategory\b/)
    expect(source).toMatch(
      /import\s+type\s*\{[^}]*\bSearchSuggestionCategory\b[^}]*\}\s*from\s*["']@\/lib\/use-cases\/search["']/
    )
  })

  it("le module mince a disparu du corpus", () => {
    expect(carte(SOURCES).has("lib/options-de-filtre.ts")).toBe(false)
  })

  it("la couture n'exporte que ses propres faits, et ne réexporte ni l'URL ni le module neutre", () => {
    const { source } = sourceDuCorpus(SOURCES, RECHERCHE)
    const exports = source
      .split("\n")
      .filter((ligne) => ligne.startsWith("export"))
      .join("\n")

    for (const fait of [
      "SearchPageData",
      "SearchOptions",
      "SuggestionProduit",
      "SearchSuggestionCategory",
      "SearchSuggestionsData",
      "searchProducts",
      "searchSuggestions",
    ]) {
      expect(exports, fait).toContain(fait)
    }

    for (const reexporte of [
      "buildSearchHref",
      "parsePage",
      "parseSearchParams",
      "parseSort",
      "SEARCH_PAGE_SIZE",
      "SEARCH_SORT_DEFAULT",
      "SEARCH_SORT_OPTIONS",
      "ParsedSearchParams",
      "SearchFacet",
      "SearchFilters",
      "SearchSort",
      "SearchView",
      "FiltreActif",
      "OptionDeFiltre",
      "OptionsDeFiltre",
      "RepartitionsDeFacettes",
    ]) {
      expect(exports, reexporte).not.toContain(reexporte)
    }

    expect(exports).not.toMatch(/\bassembler/)
    expect(source).not.toMatch(
      /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+["']@\/lib\/search-params["']/
    )
    expect(source).not.toMatch(
      /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+["']@\/lib\/filtre-de-recherche["']/
    )
    expect(importeDe(source, "lib/search-params")).toBe(true)
    expect(importeDe(source, "lib/filtre-de-recherche")).toBe(true)
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

  it("n'échoue pas sur un import type planté, et la suggestion n'emprunte que des types", () => {
    const suggestions = sourceDuCorpus(SOURCES, SUGGESTIONS)
    const typeSeul = sourceApres(
      suggestions.source,
      'import type { SearchPageData } from "@/lib/use-cases/search"'
    )
    const modifie = avecSource(SOURCES, SUGGESTIONS, typeSeul)

    expect(importeDe(typeSeul, "lib/use-cases/search")).toBe(true)
    expect(
      empruntsVersRecherche(SUGGESTIONS, typeSeul, carte(modifie))
    ).toEqual([])
    expect(fautifs(modifie)).toEqual([])

    expect(
      empruntsVersRecherche(SUGGESTIONS, suggestions.source, carte(SOURCES))
    ).toEqual([])
  })

  it("le composant de résultats emprunte buildSearchHref aux paramètres et le type à la couture", () => {
    const { source } = sourceDuCorpus(SOURCES, RESULTATS)

    expect(directive(source)).toBeNull()
    expect(importeDe(source, "lib/search-params")).toBe(true)
    expect(importeDe(source, "lib/use-cases/search")).toBe(true)
    expect(
      source,
      "buildSearchHref vient du module d'URL, comme une valeur"
    ).toMatch(
      /import\s*\{[^}]*\bbuildSearchHref\b[^}]*\}\s*from\s*["']@\/lib\/search-params["']/
    )
    expect(source, "SearchPageData vient de la couture, comme un type").toMatch(
      /import\s+type\s*\{[^}]*\bSearchPageData\b[^}]*\}\s*from\s*["']@\/lib\/use-cases\/search["']/
    )
    expect(empruntsVersRecherche(RESULTATS, source, carte(SOURCES))).toEqual([])
    expect(fautifs(SOURCES)).not.toContain(RESULTATS)
  })
})
