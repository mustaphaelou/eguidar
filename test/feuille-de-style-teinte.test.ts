import type { Declaration } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  declarationsDe,
  estDansLaRacine,
  regleDeBase,
  type FeuilleDeStyleCompilee,
  valeurNormalisee,
} from "./feuille-de-style"

function melangesDe(
  feuille: FeuilleDeStyleCompilee,
  propriete: string
): Declaration[] {
  return declarationsDe(feuille, propriete).filter((declaration) =>
    valeurNormalisee(declaration.value).startsWith("color-mix(")
  )
}

describe("la teinte de l'anneau de focus", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("se dérive dans la racine par un mélange oklch du bleu primaire", () => {
    const declarations = melangesDe(feuille, "--ring-attenue")

    expect(declarations).toHaveLength(1)
    expect(valeurNormalisee(declarations[0].value)).toBe(
      "color-mix(in oklch, var(--primary) 50%, transparent)"
    )
    expect(estDansLaRacine(declarations[0])).toBe(true)
  })

  it("est consommée par la base sous la forme du jeton dérivé", () => {
    const base = regleDeBase(feuille)
    const couleursDeContour: string[] = []

    base.walkDecls("outline-color", (declaration) => {
      couleursDeContour.push(valeurNormalisee(declaration.value))
    })

    expect(couleursDeContour).toContain("var(--ring-attenue)")
  })

  it("n'est plus mélangée en oklab par la base", () => {
    const contoursEnOklab = declarationsDe(feuille, "outline-color")
      .map((declaration) => valeurNormalisee(declaration.value))
      .filter((valeur) => valeur.includes("color-mix(in oklab"))

    expect(contoursEnOklab).toEqual([])
  })
})

describe("les autres teintes de la feuille de style", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("laissent le filet mélangé en oklch", () => {
    const declarations = declarationsDe(feuille, "--hairline")

    expect(declarations).toHaveLength(1)
    expect(valeurNormalisee(declarations[0].value)).toBe(
      "color-mix(in oklch, black 16%, transparent)"
    )
  })

  it("laissent le voile sombre mélangé en oklch", () => {
    const declarations = melangesDe(feuille, "--voile-sombre")

    expect(declarations).toHaveLength(1)
    expect(valeurNormalisee(declarations[0].value)).toBe(
      "color-mix(in oklch, black var(--voile-sombre-opacite, 30%), transparent)"
    )
  })
})
