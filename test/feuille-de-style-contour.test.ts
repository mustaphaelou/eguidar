import type { AtRule, Node, Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

function reglesDuSelecteur(
  feuille: FeuilleDeStyleCompilee,
  selecteur: string
): Rule[] {
  const regles: Rule[] = []
  feuille.racine.walkRules((regle) => {
    if (regle.selector === selecteur) regles.push(regle)
  })

  return regles
}

function estRegleArobase(noeud: Node): noeud is AtRule {
  return noeud.type === "atrule"
}

function couchesDe(regle: Rule): string[] {
  const couches: string[] = []
  let parent: Node | undefined = regle.parent

  while (parent) {
    if (estRegleArobase(parent) && parent.name === "layer") {
      couches.push(parent.params)
    }
    parent = parent.parent
  }

  return couches
}

function mediaDe(regle: Rule): string[] {
  const medias: string[] = []
  let parent: Node | undefined = regle.parent

  while (parent) {
    if (estRegleArobase(parent) && parent.name === "media") {
      medias.push(parent.params)
    }
    parent = parent.parent
  }

  return medias
}

function valeurDe(regle: Rule, propriete: string): string | undefined {
  let valeur: string | undefined
  regle.walkDecls(propriete, (declaration) => {
    valeur = declaration.value
  })

  return valeur
}

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
