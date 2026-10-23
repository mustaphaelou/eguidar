import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  reglesDuSelecteur,
  valeurDe,
} from "./feuille-de-style"

function proprietesDe(regle: Rule): string[] {
  const proprietes: string[] = []

  regle.walkDecls((declaration) => {
    proprietes.push(declaration.prop)
  })

  return proprietes
}

describe("le filet du Bandeau", () => {
  let regles: Rule[]

  beforeAll(async () => {
    const feuille = await compilerLaFeuilleDeStyle()
    regles = reglesDuSelecteur(feuille, ".filet-bas")
  })

  it("se peint d'une ombre intérieure dans le jeton du filet", () => {
    expect(regles).toHaveLength(1)
    expect(valeurDe(regles[0], "box-shadow")).toBe(
      "inset 0 -1px 0 0 var(--hairline)"
    )
  })

  it("ne réserve aucune place : la page ne bouge pas quand il apparaît", () => {
    expect(proprietesDe(regles[0])).toEqual(["box-shadow"])
  })
})
