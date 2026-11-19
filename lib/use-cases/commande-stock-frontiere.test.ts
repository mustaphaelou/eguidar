import { describe, expect, it } from "vitest"

import {
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const TRANCHE = "lib/use-cases/commande-stock.ts"
const DECLARATION_STOCK =
  /declarerApresEcriture\(\s*["']variante\.stock\.changee["']/
const ECRITURE_STOCK = /stock:\s*\{\s*(?:increment|decrement):/

function sources(): SourceProduction[] {
  return sourcesDeProduction(
    import.meta.url,
    "..",
    "../../app",
    "../../components"
  )
}

function contrevenants(corpus: readonly SourceProduction[]): string[] {
  return corpus
    .filter(
      (source) =>
        source.chemin !== TRANCHE &&
        (DECLARATION_STOCK.test(source.source) ||
          ECRITURE_STOCK.test(source.source))
    )
    .map((source) => source.chemin)
}

describe("la frontière du changement de stock", () => {
  it("le corpus de production contient la tranche et assez de modules", () => {
    const corpus = sources()
    expect(corpus.length).toBeGreaterThan(50)
    expect(corpus.map(({ chemin }) => chemin)).toContain(TRANCHE)
  })

  it("la déclaration de stock et l'écriture après mouvement n'ont qu'un propriétaire", () => {
    expect(contrevenants(sources())).toEqual([])
  })

  it("la garde tombe sur une violation synthétique", () => {
    const corpus = [
      ...sources(),
      {
        chemin: "lib/use-cases/faux-ecrivain.ts",
        source: `await declarerApresEcriture("variante.stock.changee", { produitId, slug, categoryId })`,
      },
      {
        chemin: "lib/use-cases/autre-faux-ecrivain.ts",
        source: `data: { stock: { increment: 1 } }`,
      },
    ]

    expect(contrevenants(corpus)).toEqual([
      "lib/use-cases/faux-ecrivain.ts",
      "lib/use-cases/autre-faux-ecrivain.ts",
    ])
  })
})
