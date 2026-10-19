import { beforeAll, describe, expect, it } from "vitest"
import type { Container, Declaration, Document, Rule } from "postcss"

import {
  compilerLaFeuilleDeStyle,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

function valeurNormalisee(valeur: string): string {
  return valeur
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
}

function estDansLaRacine(declaration: Declaration): boolean {
  let parent: Container | Document | undefined = declaration.parent

  while (parent) {
    if (parent.type === "rule" && (parent as Rule).selector === ":root") {
      return true
    }

    parent = parent.parent
  }

  return false
}

function declarationsDe(
  feuille: FeuilleDeStyleCompilee,
  propriete: string
): Declaration[] {
  const declarations: Declaration[] = []

  feuille.racine.walkDecls(propriete, (declaration) => {
    declarations.push(declaration)
  })

  return declarations
}

function melangesDe(
  feuille: FeuilleDeStyleCompilee,
  propriete: string
): Declaration[] {
  return declarationsDe(feuille, propriete).filter((declaration) =>
    valeurNormalisee(declaration.value).startsWith("color-mix(")
  )
}

function regleDeBase(feuille: FeuilleDeStyleCompilee): Rule {
  let trouvee: Rule | undefined

  feuille.racine.walkRules((regle) => {
    const selecteurs = regle.selector
      .split(",")
      .map((selecteur) => selecteur.trim())

    if (
      selecteurs.length === 3 &&
      selecteurs.includes("*") &&
      selecteurs.includes("*::before") &&
      selecteurs.includes("*::after")
    ) {
      trouvee = regle
    }
  })

  if (!trouvee) throw new Error("la règle de base est absente du CSS émis")

  return trouvee
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
    const contoursEnOklab: string[] = []

    feuille.racine.walkDecls("outline-color", (declaration) => {
      if (valeurNormalisee(declaration.value).includes("color-mix(in oklab")) {
        contoursEnOklab.push(valeurNormalisee(declaration.value))
      }
    })

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
