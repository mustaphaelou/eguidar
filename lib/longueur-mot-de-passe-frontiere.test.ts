import { describe, expect, it } from "vitest"

import { directive, importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Longueur minimale du mot de passe — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni import", () => {
    const source = lire(import.meta.url, "./longueur-mot-de-passe.ts")

    expect(directive(source)).toBeNull()
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
  })

  it("le serveur et les schémas clients lisent la même constante", () => {
    const auth = lire(import.meta.url, "./auth.ts")
    const schemas = lire(import.meta.url, "./auth-form-schemas.ts")

    expect(importeDe(auth, "longueur-mot-de-passe")).toBe(true)
    expect(importeDe(schemas, "longueur-mot-de-passe")).toBe(true)
  })

  it("les deux formulaires affichent la constante, jamais un second nombre", () => {
    for (const formulaire of [
      "../components/auth/sign-up-form.tsx",
      "../components/auth/forgot-password-form.tsx",
    ]) {
      const source = lire(import.meta.url, formulaire)

      expect(source).toContain("LONGUEUR_MINIMALE_MOT_DE_PASSE")
      expect(source).not.toMatch(/minLength=\{?\d+/)
    }
  })
})
