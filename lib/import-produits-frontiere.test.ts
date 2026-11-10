import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Import de produits — le contrat est neutre", () => {
  it("n'importe que la grammaire du slug, depuis son propriétaire", () => {
    const source = lire(import.meta.url, "./import-produits.ts")

    const imports = [...source.matchAll(/^\s*import\b[^\n]*$/gm)].map(
      (reference) => reference[0]
    )
    expect(imports).toHaveLength(1)
    expect(imports[0]).toMatch(/\bfrom\s+["']\.\/slug["']/)
    expect(source).not.toMatch(/\brequire\s*\(/)
    expect(source).not.toMatch(/^"use (client|server)"/m)
    expect(importeDe(source, "lib/db")).toBe(false)
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
  })

  it("le propriétaire de la grammaire du slug n'importe lui-même rien", () => {
    const source = lire(import.meta.url, "./slug.ts")

    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(source).not.toMatch(/\brequire\s*\(/)
  })
})
