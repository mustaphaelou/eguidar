import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Le plan d'import — pur et sans Catalogue", () => {
  it("n'importe que le contrat du fichier", () => {
    const source = lire(import.meta.url, "./plan-import-produits.ts")

    expect(source).not.toMatch(/\bfrom\s*["'](?!\.\/import-produits["'])/)
    expect(importeDe(source, "lib/db")).toBe(false)
    expect(importeDe(source, "next/headers")).toBe(false)
    expect(importeDe(source, "server-only")).toBe(false)
    expect(importeDe(source, "react")).toBe(false)
    expect(importeDe(source, "@prisma/client")).toBe(false)
    expect(source).not.toMatch(/^"use (client|server)"/m)
  })
})
