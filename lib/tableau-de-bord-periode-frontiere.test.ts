import { describe, expect, it } from "vitest"

import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

describe("Période du Tableau de bord — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni import, ni base", () => {
    const source = lire(import.meta.url, "./tableau-de-bord-periode.ts")
    expect(source).not.toMatch(/^["']use (?:client|server)["']/m)
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bfrom\s*["']/)
    expect(importeDe(source, "lib/db")).toBe(false)
  })

  it("le graphique client emprunte le point au module neutre, sans le redéclarer", () => {
    const graphique = lire(
      import.meta.url,
      "../components/admin/graphique-chiffre-affaires.tsx"
    )
    expect(importeDe(graphique, "tableau-de-bord-periode")).toBe(true)
    expect(graphique).not.toMatch(/interface\s+PointDeChiffreAffaires/)
    expect(importeDe(graphique, "lib/db")).toBe(false)
    expect(importeDe(graphique, "lib/use-cases/admin-dashboard")).toBe(false)
  })
})
