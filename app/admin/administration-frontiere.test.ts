import { describe, expect, it } from "vitest"

import {
  directive,
  importeDe,
  sourceDuCorpus,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const SOURCES_ADMINISTRATION = sourcesDeProduction(
  import.meta.url,
  "../../app/admin",
  "../../components/admin"
)

const CONFIRM_NATIF = /\b(?:window\.)?confirm\s*\(/

const SURFACES_IMPORT = [
  "app/admin/produits/importer/page.tsx",
  "app/admin/produits/importer/actions.ts",
  "app/admin/produits/importer/formulaire-import.tsx",
  "app/admin/produits/importer/panneau-lot-import.tsx",
] as const

describe("l'Administration ne demande plus confirmation au navigateur", () => {
  it("aucune source de l'Administration n'appelle le confirm() natif", () => {
    const appels = SOURCES_ADMINISTRATION.filter(({ source }) =>
      CONFIRM_NATIF.test(source)
    ).map(({ chemin }) => chemin)

    expect(appels).toEqual([])
  })
})

describe("l'import des Produits passe par la porte de l'Administration", () => {
  it("le parcours est non vacuant : il voit la page, l'action et les composants", () => {
    expect(SOURCES_ADMINISTRATION.length).toBeGreaterThan(25)
    expect(SOURCES_ADMINISTRATION.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([...SURFACES_IMPORT])
    )
  })

  it("aucune surface de l'import n'importe la base de données", () => {
    for (const chemin of SURFACES_IMPORT) {
      const { source } = sourceDuCorpus(SOURCES_ADMINISTRATION, chemin)
      expect(importeDe(source, "lib/db"), chemin).toBe(false)
    }
  })

  it("l'action est une action serveur déclarée par adminFormAction", () => {
    const action = sourceDuCorpus(
      SOURCES_ADMINISTRATION,
      "app/admin/produits/importer/actions.ts"
    )

    expect(directive(action.source)).toBe("use server")
    expect(action.source).toContain("adminFormAction")
  })

  it("la page vit sous la porte du layout, qui lit la Session et vérifie le rôle", () => {
    expect(SURFACES_IMPORT[0].startsWith("app/admin/")).toBe(true)
    const layout = sourceDuCorpus(
      SOURCES_ADMINISTRATION,
      "app/admin/layout.tsx"
    ).source

    expect(layout).toContain("lireSession")
    expect(layout).toContain("estAdmin")
    expect(layout).toContain("redirect")
  })
})
