import type { Declaration } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  declarationsDe,
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
