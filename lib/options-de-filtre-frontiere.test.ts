import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

describe("Option de filtre — frontière client/serveur", () => {
  it("le module est neutre : ni use client, ni crochet, ni base, ni moteur", () => {
    const source = lire(import.meta.url, "./options-de-filtre.ts")

    expect(source).toContain("assemblerOptionsDeFiltre")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/)
    for (const interdit of [
      "lib/db",
      "next/headers",
      "server-only",
      "lib/meili",
      "meilisearch",
      "moteur-recherche",
    ]) {
      expect(importeDe(source, interdit), interdit).toBe(false)
    }
  })

  it("la barre latérale atteint les options par le module neutre", () => {
    const barre = lire(
      import.meta.url,
      "../components/storefront/search-filters.tsx"
    )

    expect(importeDe(barre, "options-de-filtre")).toBe(true)
    expect(importeDe(barre, "price-buckets")).toBe(false)
    expect(importeDe(barre, "use-cases/search")).toBe(false)
  })

  it("aucune surface qui rend les options n'atteint la base", () => {
    const sources = sourcesDeProduction(import.meta.url, "../components")
    expect(sources.length).toBeGreaterThan(50)

    const rendeurs = sources.filter(({ source }) =>
      importeDe(source, "options-de-filtre")
    )
    expect(rendeurs.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining(["components/storefront/search-filters.tsx"])
    )
    for (const { chemin, source } of rendeurs) {
      expect(importeDe(source, "lib/db"), chemin).toBe(false)
    }
  })
})
