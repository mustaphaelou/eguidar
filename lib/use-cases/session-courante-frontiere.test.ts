import { describe, expect, it } from "vitest"

import {
  atteignables,
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE = "lib/use-cases/session-courante.ts"

function estClient(source: string): boolean {
  return /^["']use client["']/m.test(source)
}

describe("Session courante — frontière client/serveur", () => {
  it("le module est serveur : il porte server-only et la lecture ne refuse pas", () => {
    const source = lire(import.meta.url, "./session-courante.ts")

    expect(source).toMatch(/^import "server-only"$/m)
    expect(source).not.toMatch(/^["']use client["']/m)
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
    expect(sources.length).toBeGreaterThan(200)
    expect(sources.map(({ chemin }) => chemin)).toContain(
      "app/(boutique)/page.tsx"
    )

    const parChemin = new Map(sources.map((source) => [source.chemin, source]))
    const composantsClients = sources.filter(({ source }) => estClient(source))
    expect(composantsClients.length).toBeGreaterThan(50)
    expect(composantsClients.map(({ chemin }) => chemin)).toContain(
      "components/storefront/article-du-panier.tsx"
    )

    const atteints = new Set<string>()
    for (const { chemin } of composantsClients) {
      for (const atteint of atteignables(chemin, parChemin)) {
        atteints.add(atteint)
      }
    }

    expect(atteints.has(MODULE)).toBe(false)
    expect(atteints.size).toBeGreaterThan(composantsClients.length)
    expect(atteints.has("lib/carte-produit.ts")).toBe(true)
  })
})
