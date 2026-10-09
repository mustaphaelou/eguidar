import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

describe("Carte produit — frontière client/serveur", () => {
  const SURFACES_CLIENTES: Record<string, string> = {
    "produit-lie-carte.tsx": "./carte-produit",
    "carte-produit.tsx": "@/lib/carte-produit",
    "product-card.tsx": "@/lib/carte-produit",
    "search-suggestions.tsx": "@/lib/carte-produit",
  }

  it("le module est neutre : ni use client, ni crochet, ni base", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/useState/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le module n'importe rien : sa neutralité est inconditionnelle", () => {
    const source = lire(import.meta.url, "./carte-produit.ts")
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
  })

  it("la lecture serveur du Produit lié projette par le module neutre", () => {
    const blog = lire(import.meta.url, "./use-cases/blog.ts")
    expect(importeDe(blog, "carte-produit")).toBe(true)
    expect(blog).toContain("projeterCarteProduit")
    expect(blog).not.toMatch(/images\[0\]/)
  })

  it("chaque surface cliente atteint la Carte produit par le module neutre", () => {
    for (const [fichier, module] of Object.entries(SURFACES_CLIENTES)) {
      const source = lire(
        import.meta.url,
        `../components/storefront/${fichier}`
      )
      expect(importeDe(source, module), fichier).toBe(true)
      expect(importeDe(source, "lib/db"), fichier).toBe(false)
    }
  })

  it("aucun composant qui importe la Carte produit n'importe la base", () => {
    const sources = sourcesDeProduction(import.meta.url, "../components")
    expect(sources.length).toBeGreaterThan(50)

    const importateurs = sources.filter(({ source }) =>
      importeDe(source, "carte-produit")
    )
    expect(importateurs.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "components/storefront/carte-produit.tsx",
        "components/storefront/product-card.tsx",
        "components/storefront/produit-lie-carte.tsx",
        "components/storefront/search-suggestions.tsx",
      ])
    )
    for (const { chemin, source } of importateurs) {
      expect(importeDe(source, "lib/db"), chemin).toBe(false)
    }
  })

  it("`/produit/` n'est écrit que par `urlProduit`", () => {
    const sources = sourcesDeProduction(
      import.meta.url,
      "../app",
      "../components",
      "../lib"
    )
    expect(sources.length).toBeGreaterThan(100)
    expect(sources.map(({ chemin }) => chemin)).toContain(
      "app/(boutique)/page.tsx"
    )

    const ecrivains = sources
      .filter(({ source }) => source.includes("/produit/"))
      .map(({ chemin }) => chemin)
    expect(ecrivains).toEqual(["lib/carte-produit.ts"])

    const proprietaire = sources.find(
      ({ chemin }) => chemin === "lib/carte-produit.ts"
    )
    expect(proprietaire?.source.match(/\/produit\//g)).toHaveLength(1)
  })
})
