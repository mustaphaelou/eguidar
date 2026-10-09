import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

const MODULES_CLIENT_ET_BASE = [
  "meilisearch",
  "lib/db",
  "next/headers",
  "next/navigation",
  "server-only",
  "react",
  "react-dom",
  "lib/client",
] as const

const MODULES_INTERDITS = [...MODULES_CLIENT_ET_BASE, "lib/meili"] as const
const MODULES_ORCHESTRATION_INTERDITS = [
  "meilisearch",
  "next/navigation",
  "react",
  "react-dom",
  "lib/client",
] as const

function aucuneDependance(source: string, modules: readonly string[]): void {
  for (const nom of modules) {
    expect(importeDe(source, nom), nom).toBe(false)
  }
}

describe("Moteur de recherche — frontière", () => {
  it("la couture est neutre : ni SDK Meili, ni adaptateur, ni base", () => {
    const couture = lire(import.meta.url, "./moteur-recherche.ts")

    expect(couture).not.toMatch(/^["']use client["']/m)
    aucuneDependance(couture, MODULES_INTERDITS)
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
    expect(importeDe('reimport("react")', "react")).toBe(false)
  })

  it("l'orchestration ne parle pas au SDK Meili", () => {
    const orchestration = lire(import.meta.url, "./use-cases/search.ts")

    aucuneDependance(orchestration, MODULES_ORCHESTRATION_INTERDITS)
    expect(importeDe(orchestration, "lib/meili")).toBe(true)
  })

  it("le langage d'URL reste neutre et ne réexporte pas la langue Meili", () => {
    const langageUrl = lire(import.meta.url, "./search-params.ts")
    const orchestration = lire(import.meta.url, "./use-cases/search.ts")

    aucuneDependance(langageUrl, MODULES_INTERDITS)
    expect(langageUrl).not.toMatch(
      /buildSearchFilter|escapeFilterValue|priceBucketFilter/
    )
    expect(orchestration).not.toMatch(/buildSearchFilter|escapeFilterValue/)
  })
})
