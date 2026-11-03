import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Règles du compteur d'échecs de Connexion — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni import, ni base", () => {
    const source = lire(import.meta.url, "./echecs-connexion-regles.ts")

    expect(source).not.toMatch(/^["']use client["']/m)
    expect(source).not.toMatch(/^["']use server["']/m)
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(importeDe(source, "server-only")).toBe(false)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("les deux côtés de la frontière empruntent la même valeur", () => {
    const client = lire(import.meta.url, "../components/auth/auth-form-glue.ts")
    const serveur = lire(import.meta.url, "./echecs-connexion.ts")

    expect(client).toMatch(/^"use client"/m)
    expect(importeDe(client, "echecs-connexion-regles")).toBe(true)
    expect(importeDe(serveur, "echecs-connexion-regles")).toBe(true)
  })
})
