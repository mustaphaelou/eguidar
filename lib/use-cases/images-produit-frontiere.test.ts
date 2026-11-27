import { describe, expect, it } from "vitest"

import {
  sourceApres,
  sourceDuCorpus,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const PROPRIETAIRE = "lib/use-cases/images-produit.ts"

const ACCES_REGISTRE = /\b(?:prisma|tx)\.imageProduit\b/

const CAST_SPECS = /[\w$]+\s*\??\.\s*specs\b(?:\s|\n\s*)*?\bas\s+/g

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
).filter(({ chemin }) => !chemin.startsWith("lib/generated/"))

const SOURCES_USE_CASES = SOURCES.filter(({ chemin }) =>
  chemin.startsWith("lib/use-cases/")
)

function lecteursDuRegistre(
  sources: readonly { chemin: string; source: string }[]
): string[] {
  return sources
    .filter(({ source }) => ACCES_REGISTRE.test(source))
    .map(({ chemin }) => chemin)
    .sort()
}

function castsSpecs(source: string): string[] {
  return [...source.matchAll(CAST_SPECS)]
    .map((match) => match[0].replace(/\n/g, " "))
    .sort()
}

describe("Registre des Images produit — propriétaire unique de lecture et d'écriture", () => {
  it("le parcours est non vacuant : les appelants historiques et le propriétaire sont visités", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        PROPRIETAIRE,
        "lib/use-cases/admin-catalog.ts",
        "lib/use-cases/import-produits.ts",
        "lib/use-cases/storefront.ts",
      ])
    )
  })

  it("seul images-produit.ts interroge prisma.imageProduit en production", () => {
    expect(lecteursDuRegistre(SOURCES)).toEqual([PROPRIETAIRE])
  })

  it("la garde tombe sur une lecture directe synthétique dans un appelant", () => {
    const storefront = sourceDuCorpus(SOURCES, "lib/use-cases/storefront.ts")
    const enViolation = sourceApres(
      storefront.source,
      "void prisma.imageProduit.findMany()"
    )
    expect(
      lecteursDuRegistre([
        ...SOURCES.filter(({ chemin }) => chemin !== storefront.chemin),
        { chemin: storefront.chemin, source: enViolation },
      ])
    ).toEqual([PROPRIETAIRE, "lib/use-cases/storefront.ts"])
  })

  it("aucun cas d'usage ne force la colonne specs par un cast brut", () => {
    for (const { chemin, source } of SOURCES_USE_CASES) {
      expect(castsSpecs(source), chemin).toEqual([])
    }
    expect(
      castsSpecs("specs: produit.specs as unknown as Record<string, string>")
    ).toEqual(["produit.specs as "])
  })
})
