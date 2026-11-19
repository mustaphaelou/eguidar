import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE = "./moyen-de-connexion.ts"

describe("Moyen de connexion — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni crochet, ni base", () => {
    const source = lire(import.meta.url, MODULE)
    expect(source).not.toMatch(/^"use (?:client|server)"/m)
    expect(source).not.toMatch(/useState|useEffect|useSyncExternalStore/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le module n'importe rien : sa neutralité est inconditionnelle", () => {
    const source = lire(import.meta.url, MODULE)
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
  })

  it("la garde tombe sur une violation synthétique", () => {
    const violation = `"use client"\nimport { prisma } from "@/lib/db"\nimport { headers } from "next/headers"\n`

    expect(violation).toMatch(/^"use (?:client|server)"/m)
    expect(violation).toMatch(/^\s*import\b/m)
    expect(importeDe(violation, "lib/db")).toBe(true)
    expect(importeDe(violation, "next/headers")).toBe(true)
  })

  it("le serveur et le client atteignent le même module neutre", () => {
    const serveur = lire(import.meta.url, "./auth.ts")
    const client = lire(import.meta.url, "./client.ts")

    expect(importeDe(serveur, "moyen-de-connexion")).toBe(true)
    expect(importeDe(client, "moyen-de-connexion")).toBe(true)
    expect(importeDe(client, "lib/db")).toBe(false)
  })

  it("le nom du cookie n'est écrit que par le module neutre et la page Conditions", () => {
    const sources = sourcesDeProduction(
      import.meta.url,
      "../app",
      "../components",
      "../lib"
    )
    expect(sources.length).toBeGreaterThan(100)

    const ecrivains = sources
      .filter(({ source }) =>
        source.includes("eguidar.dernier-moyen-de-connexion")
      )
      .map(({ chemin }) => chemin)
      .sort()

    expect(ecrivains).toEqual([
      "app/(boutique)/conditions/page.tsx",
      "lib/moyen-de-connexion.ts",
    ])
  })
})
