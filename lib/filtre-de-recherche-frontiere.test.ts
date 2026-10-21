import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

const MODULES_INTERDITS = [
  "meilisearch",
  "lib/db",
  "lib/meili",
  "lib/use-cases",
  "lib/client",
  "next/headers",
  "next/navigation",
  "server-only",
  "react",
  "react-dom",
] as const

const CHEMIN_DU_MODULE = "lib/filtre-de-recherche.ts"

function aucuneDependance(
  source: string,
  chemin: string,
  modules: readonly string[]
): void {
  for (const nom of modules) {
    expect(importeDe(source, nom, chemin), nom).toBe(false)
  }
}

describe("Filtre de recherche — frontière", () => {
  it("le module est neutre : ni use client, ni base, ni moteur, ni serveur, ni React", () => {
    const filtre = lire(import.meta.url, "./filtre-de-recherche.ts")

    expect(filtre).not.toMatch(/^["']use client["']/m)
    aucuneDependance(filtre, CHEMIN_DU_MODULE, MODULES_INTERDITS)
  })

  it("le module n'emprunte au langage d'URL que le type des filtres", () => {
    const filtre = lire(import.meta.url, "./filtre-de-recherche.ts")

    expect(importeDe(filtre, "price-buckets")).toBe(true)
    expect(importeDe(filtre, "search-params")).toBe(true)
    expect(filtre).toMatch(
      /import\s+type\s+\{[^}]*SearchFilters[^}]*\}\s+from\s+["']@\/lib\/search-params["']/
    )
  })

  it("la garde reconnaît imports nus, réexports et imports dynamiques", () => {
    expect(importeDe('import "meilisearch"', "meilisearch")).toBe(true)
    expect(importeDe('export * from "@/lib/meili"', "lib/meili")).toBe(true)
    expect(importeDe('import "react"', "react")).toBe(true)
    expect(
      importeDe(
        "import(/* forbidden */ `meilisearch`, { with: {} })",
        "meilisearch"
      )
    ).toBe(true)
    expect(
      importeDe(
        "import( // forbidden\n `meilisearch`, { with: {} })",
        "meilisearch"
      )
    ).toBe(true)
    expect(importeDe('import("./meili")', "lib/meili")).toBe(true)
    expect(importeDe('import "@/lib/db.ts"', "lib/db")).toBe(true)
    expect(importeDe('import "@/lib/use-cases/search"', "lib/use-cases")).toBe(
      true
    )
    expect(importeDe('reimport("react")', "react")).toBe(false)
  })

  it("résout un import relatif depuis le chemin du module", () => {
    const source = [
      'import "./use-cases/search"',
      'import "./db"',
      'import "./meili"',
    ].join("\n")

    expect(importeDe(source, "lib/use-cases", CHEMIN_DU_MODULE)).toBe(true)
    expect(importeDe(source, "lib/db", CHEMIN_DU_MODULE)).toBe(true)
    expect(importeDe(source, "lib/meili", CHEMIN_DU_MODULE)).toBe(true)
    expect(importeDe(source, "lib/autre", CHEMIN_DU_MODULE)).toBe(false)
  })
})
