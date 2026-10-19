import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  couchesDe,
  mediaDe,
  reglesDuSelecteur,
  type FeuilleDeStyleCompilee,
  valeurDe,
} from "./feuille-de-style"

describe("le contour de focus en couleurs forcées", () => {
  let feuille: FeuilleDeStyleCompilee
  let reglesSansContour: Rule[]

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
    reglesSansContour = reglesDuSelecteur(feuille, ".outline-none")
  })

  it("émet outline-style: none pour l'utilitaire qui retire le contour", () => {
    const regles = reglesSansContour.filter(
      (regle) => mediaDe(regle).length === 0 && couchesDe(regle).length === 0
    )

    expect(regles).toHaveLength(1)
    expect(valeurDe(regles[0], "outline-style")).toBe("none")
  })

  it("restaure un contour transparent décalé en couleurs forcées", () => {
    const regles = reglesSansContour.filter((regle) =>
      mediaDe(regle).includes("(forced-colors: active)")
    )

    expect(regles).toHaveLength(1)
    expect(valeurDe(regles[0], "outline")).toBe("2px solid transparent")
    expect(valeurDe(regles[0], "outline-offset")).toBe("2px")
    expect(couchesDe(regles[0])).toEqual([])
  })

  it("écrit ces règles hors de toute couche pour battre les utilitaires", () => {
    expect(reglesSansContour.length).toBeGreaterThanOrEqual(2)
    expect(
      reglesSansContour.every((regle) => couchesDe(regle).length === 0)
    ).toBe(false)

    const reglesHorsCouche = reglesSansContour.filter(
      (regle) => couchesDe(regle).length === 0
    )

    expect(reglesHorsCouche).toHaveLength(2)
  })
})
