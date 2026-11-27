import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Tableau de bord — frontière de lecture et seuil de stock", () => {
  it("la page du Tableau de bord ne lit que par admin-dashboard", () => {
    const page = lire(import.meta.url, "../../app/admin/page.tsx")
    expect(importeDe(page, "lib/use-cases/admin-dashboard")).toBe(true)
    expect(importeDe(page, "lib/use-cases/images-produit")).toBe(false)
    expect(importeDe(page, "lib/automations/historique")).toBe(false)
  })

  it("la liste des Produits emprunte SEUIL_STOCK_FAIBLE au module neutre sans le redéclarer", () => {
    const table = lire(
      import.meta.url,
      "../../app/admin/produits/produits-table.tsx"
    )
    expect(importeDe(table, "lib/seuil-stock")).toBe(true)
    expect(table).not.toMatch(/\bconst\s+SEUIL_STOCK_FAIBLE\b/)
  })

  it("seuil-stock reste neutre : ni directive, ni import, ni base", () => {
    const source = lire(import.meta.url, "../seuil-stock.ts")
    expect(source).not.toMatch(/^["']use (?:client|server)["']/m)
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })
})
