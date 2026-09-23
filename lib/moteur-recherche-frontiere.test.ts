import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

const MODULES_INTERDITS = [
  "meilisearch",
  "lib/meili",
  "lib/db",
  "next/headers",
  "next/navigation",
  "server-only",
  "react",
  "react-dom",
  "lib/client",
] as const

/**
 * `importeDe` couvre les imports et réexports qui nomment leur module avec
 * `from`. Cette petite variante ajoute les imports nus (`import "x"`), afin
 * qu'une dépendance interdite ne puisse pas se cacher derrière une forme
 * d'import sans clause `from`.
 */
function importeOuReexporte(source: string, module: string): boolean {
  if (importeDe(source, module)) return true
  const moduleEchappe = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `(?:import|export)\\s+(?:type\\s+)?["'][^"']*${moduleEchappe}["']`,
    "m"
  ).test(source)
}

/**
 * Frontière du Moteur de recherche — couture neutre, sans moteur.
 *
 * `lib/moteur-recherche.ts` nomme la couture de la Recherche sans nommer un
 * moteur : y importer `meilisearch` (le SDK), `@/lib/meili` (son
 * adaptateur), `@/lib/db`, `next/headers` ou `server-only` remettrait
 * l'identité du moteur — et le graphe serveur — dans le module neutre, ce
 * que l'ADR-0023 interdit et que `next build` paierait (Turbopack).
 * `lib/use-cases/search.ts` orchestre la Recherche derrière la couture :
 * il passe par `moteurMeili()`, jamais par le SDK directement.
 */
describe("Moteur de recherche — frontière", () => {
  it("la couture est neutre : ni SDK Meili, ni adaptateur, ni base", () => {
    const couture = lire(import.meta.url, "./moteur-recherche.ts")

    expect(couture).not.toMatch(/^"use client"/m)
    expect(couture).not.toMatch(/["'](?:server-only|next\/headers)["']/)
    for (const interdit of MODULES_INTERDITS) {
      expect(importeOuReexporte(couture, interdit), interdit).toBe(false)
    }
  })

  it("la garde reconnaît les imports nus et les réexports de l'adaptateur", () => {
    expect(importeOuReexporte('import "meilisearch"', "meilisearch")).toBe(true)
    expect(importeOuReexporte('export * from "@/lib/meili"', "lib/meili")).toBe(
      true
    )
    expect(importeOuReexporte('import "react"', "react")).toBe(true)
  })

  it("l'orchestration ne parle pas au SDK Meili", () => {
    const orchestration = lire(import.meta.url, "./use-cases/search.ts")

    expect(importeDe(orchestration, "meilisearch")).toBe(false)
    expect(importeDe(orchestration, "lib/meili")).toBe(true)
  })

  it("le langage d'URL reste neutre et ne réexporte pas la langue Meili", () => {
    const langageUrl = lire(import.meta.url, "./search-params.ts")
    const orchestration = lire(import.meta.url, "./use-cases/search.ts")

    expect(importeDe(langageUrl, "meilisearch")).toBe(false)
    expect(importeDe(langageUrl, "lib/meili")).toBe(false)
    expect(langageUrl).not.toMatch(
      /buildSearchFilter|escapeFilterValue|priceBucketFilter/
    )
    expect(orchestration).not.toMatch(/buildSearchFilter|escapeFilterValue/)
  })
})
