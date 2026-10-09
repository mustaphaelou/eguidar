import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Langage d'URL de la Ville — frontière client/serveur", () => {
  it("le module est neutre : ni use client, ni crochet, ni accès base", () => {
    const source = lire(import.meta.url, "./ville-url.ts")
    expect(source).not.toMatch(/^"use client"/m)
    expect(source).not.toMatch(/useState/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le type de Ville vient du module pur, jamais de l'entrée base", () => {
    const source = lire(import.meta.url, "./ville-url.ts")
    expect(importeDe(source, "livraison-prix")).toBe(true)
    expect(source).not.toMatch(/from\s*["'][^"']*\/livraison["']/)
  })
})
