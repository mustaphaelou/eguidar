import { describe, expect, it } from "vitest"

import { directive, importeDe, lire } from "@/lib/use-cases/outils-frontiere"

const SOURCE = lire(import.meta.url, "./apercu-du-panier-identifiants.ts")

describe("Identifiants de l'Aperçu du Panier — frontière client/serveur", () => {
  it("le module est neutre : ni « use client », ni « use server »", () => {
    expect(directive(SOURCE)).toBeNull()
    expect(SOURCE).not.toMatch(/^["']use (client|server)["']/m)
  })

  it("le module n'importe rien, ni la base, ni les en-têtes de requête", () => {
    expect(SOURCE).not.toMatch(/^\s*import\b/m)
    expect(SOURCE).not.toMatch(/\bfrom\s*["']/)
    expect(importeDe(SOURCE, "lib/db")).toBe(false)
    expect(importeDe(SOURCE, "next/headers")).toBe(false)
  })
})
