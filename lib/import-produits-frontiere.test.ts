import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Import de produits — le contrat est neutre", () => {
  it("n'importe rien : sa neutralité est inconditionnelle", () => {
    const source = lire(import.meta.url, "./import-produits.ts")

    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(source).not.toMatch(/\brequire\s*\(/)
    expect(source).not.toMatch(/^"use (client|server)"/m)
    expect(importeDe(source, "lib/db")).toBe(false)
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
  })
})
