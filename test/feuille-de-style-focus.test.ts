import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  declarationsDe,
  estDansLaCoucheBase,
  reglesDuSelecteur,
  type FeuilleDeStyleCompilee,
  valeurDe,
  valeurNormalisee,
} from "./feuille-de-style"

function regleDeFocus(feuille: FeuilleDeStyleCompilee): Rule {
  const regles = reglesDuSelecteur(feuille, ":focus-visible").filter(
    estDansLaCoucheBase
  )

  expect(regles).toHaveLength(1)

  return regles[0]
}

describe("l'anneau de focus global", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("se dessine dans la base en 2 px opaques de #0071e3", () => {
    expect(valeurDe(regleDeFocus(feuille), "outline")).toBe("2px solid #0071e3")
  })

  it("se décolle de 1 px du contour", () => {
    expect(valeurDe(regleDeFocus(feuille), "outline-offset")).toBe("1px")
  })

  it("garde une couleur pleine, sans mélange translucide", () => {
    const contour = valeurDe(regleDeFocus(feuille), "outline") ?? ""
    const couleur = contour.split(" ").at(-1)

    expect(couleur).toBe("#0071e3")
    expect(contour).not.toMatch(/transparent|color-mix/)
  })

  it("retire le jeton translucide et toute référence dans la base", () => {
    expect(declarationsDe(feuille, "--ring-attenue")).toEqual([])

    const contours = declarationsDe(feuille, "outline-color").map(
      (declaration) => valeurNormalisee(declaration.value)
    )

    expect(contours).not.toContain("var(--ring-attenue)")
  })
})
