import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesToutes,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const SERVEUR_SANS_CLIENT = [
  "./devis.ts",
  "./orders.ts",
  "../../app/(boutique)/panier/page.tsx",
  "../../app/(boutique)/checkout/page.tsx",
]

const AUTEURS_DU_COEUR = [
  "lib/use-cases/devis-selection.ts",
  "lib/use-cases/devis.ts",
] as const

const CETTE_SUITE = "lib/use-cases/devis-frontiere.test.ts"

const SOURCES = sourcesToutes(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../test"
)

function auteursDuCoeur(sources: SourceProduction[]): string[] {
  return sources
    .filter(({ chemin }) => chemin !== CETTE_SUITE)
    .filter(({ source }) => importeDe(source, "devis-coeur"))
    .map(({ chemin }) => chemin)
    .sort()
}

describe("Devis — frontière client/serveur", () => {
  it("aucun module serveur n'importe le module client devis-selection", () => {
    for (const fichier of SERVEUR_SANS_CLIENT) {
      expect(
        importeDe(lire(import.meta.url, fichier), "devis-selection"),
        fichier
      ).toBe(false)
    }
  })

  it("le cœur pur est neutre : ni use client, ni crochet, ni accès base", () => {
    const coeur = lire(import.meta.url, "./devis-coeur.ts")
    expect(coeur).not.toMatch(/^"use client"/m)
    expect(coeur).not.toMatch(/useState/)
    expect(importeDe(coeur, "lib/db")).toBe(false)
  })

  it("l'entrée cliente garde use client et réexporte le pur depuis le cœur", () => {
    const selection = lire(import.meta.url, "./devis-selection.ts")
    expect(selection).toMatch(/^"use client"/m)
    expect(importeDe(selection, "devis-coeur")).toBe(true)
    expect(importeDe(selection, "lib/db")).toBe(false)
  })
})

describe("Devis — couture interne du cœur pur", () => {
  it("le cœur pur n'a que la porte serveur et le crochet client pour auteurs", () => {
    expect(auteursDuCoeur(SOURCES)).toEqual([...AUTEURS_DU_COEUR])
  })

  it("le parcours est non vacuant : les quatre arbres sont visités, tests compris", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/(boutique)/panier/page.tsx",
        "components/storefront/checkout-form.tsx",
        "lib/use-cases/devis.ts",
        "lib/use-cases/devis-selection.ts",
        "lib/use-cases/devis.test.ts",
        "test/navigation-mocks.ts",
      ])
    )
    expect(auteursDuCoeur(SOURCES)).toEqual([...AUTEURS_DU_COEUR])
  })

  it("la garde distingue l'auteur autorisé de l'auteur interdit", () => {
    const fictifs = [
      'import { projeterDevis } from "@/lib/use-cases/devis-coeur"\n',
      'import { projeterDevis } from "./devis-coeur"\n',
      'export { projeterDevis } from "@/lib/use-cases/devis-coeur"\n',
    ]
    for (const source of fictifs) {
      expect(
        auteursDuCoeur([
          ...SOURCES,
          { chemin: "lib/use-cases/fictif.ts", source },
        ]),
        source
      ).toEqual([...AUTEURS_DU_COEUR, "lib/use-cases/fictif.ts"])
    }

    expect(
      auteursDuCoeur([
        ...SOURCES,
        {
          chemin: "lib/use-cases/fictif.ts",
          source: 'import { chargerDevis } from "@/lib/use-cases/devis"\n',
        },
      ])
    ).toEqual([...AUTEURS_DU_COEUR])

    const reel = lire(
      import.meta.url,
      "../../components/storefront/checkout-form.tsx"
    )
    const avecCoeur =
      reel + '\nimport { projeterDevis } from "@/lib/use-cases/devis-coeur"\n'
    expect(avecCoeur).not.toBe(reel)
    expect(
      auteursDuCoeur([
        ...SOURCES,
        {
          chemin: "components/storefront/checkout-form.tsx",
          source: avecCoeur,
        },
      ])
    ).toEqual(["components/storefront/checkout-form.tsx", ...AUTEURS_DU_COEUR])
  })
})
