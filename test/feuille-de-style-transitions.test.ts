import assert from "node:assert/strict"

import { beforeAll, describe, expect, it } from "vitest"
import type { ChildNode, Declaration, Node, Rule } from "postcss"

import {
  compilerLaFeuilleDeStyle,
  estHorsCouche,
  type FeuilleDeStyleCompilee,
  reglesDuSelecteur,
  requeteMedia,
} from "./feuille-de-style"

type PrimitiveTransitee = {
  slot: string
  nom: string
  proprietes: string[]
}

const PRIMITIVES_TRANSITEES: PrimitiveTransitee[] = [
  {
    slot: "button",
    nom: "le bouton",
    proprietes: [
      "color",
      "background-color",
      "border-color",
      "text-decoration-color",
      "box-shadow",
      "opacity",
    ],
  },
  {
    slot: "switch",
    nom: "l'interrupteur",
    proprietes: ["background-color", "border-color", "box-shadow", "opacity"],
  },
  {
    slot: "accordion-trigger",
    nom: "le déclencheur d'accordéon",
    proprietes: ["color", "text-decoration-color", "opacity"],
  },
  {
    slot: "badge",
    nom: "le badge",
    proprietes: [
      "color",
      "background-color",
      "border-color",
      "text-decoration-color",
      "box-shadow",
      "opacity",
    ],
  },
]

function proprietesDeTransition(regle: Rule): string[] {
  const declaration = regle.nodes.find(
    (noeud): noeud is Declaration =>
      noeud.type === "decl" && noeud.prop === "transition-property"
  )
  assert(
    declaration,
    `la règle ${regle.selector} ne déclare pas transition-property`
  )

  return declaration.value.split(",").map((propriete) => propriete.trim())
}

function regleSansRequete(regles: Rule[]): Rule | undefined {
  return regles.find((regle) => requeteMedia(regle) === undefined)
}

function positionDansLaFeuille(
  feuille: FeuilleDeStyleCompilee,
  noeud: Node
): number {
  let sommet = noeud

  while (sommet.parent && sommet.parent !== feuille.racine) {
    sommet = sommet.parent
  }

  return feuille.racine.index(sommet as ChildNode)
}

function derniereCoucheUtilities(feuille: FeuilleDeStyleCompilee): number {
  let position = -1

  feuille.racine.each((noeud, index) => {
    if (
      noeud.type === "atrule" &&
      noeud.name === "layer" &&
      noeud.params.trim() === "utilities"
    ) {
      position = index
    }
  })

  return position
}

describe("les transitions nomment leurs propriétés", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  for (const primitive of PRIMITIVES_TRANSITEES) {
    it(`nomme, hors de toute couche, les propriétés animées par ${primitive.nom}`, () => {
      const selecteur = `[data-slot="${primitive.slot}"]`
      const regles = reglesDuSelecteur(feuille, selecteur).filter(estHorsCouche)
      const regle = regleSansRequete(regles)
      assert(regle, `${selecteur} n'a pas de règle hors couche`)

      const proprietes = proprietesDeTransition(regle)
      expect(proprietes).not.toContain("all")
      for (const propriete of primitive.proprietes) {
        expect(proprietes).toContain(propriete)
      }
    })
  }

  it("n'anime pas la pression du bouton quand le mouvement est refusé", () => {
    const selecteur = '[data-slot="button"]'
    const regles = reglesDuSelecteur(feuille, selecteur).filter(estHorsCouche)
    const regle = regleSansRequete(regles)
    assert(regle, `${selecteur} n'a pas de règle hors couche`)

    expect(proprietesDeTransition(regle)).not.toContain("translate")
  })

  it("ajoute la pression du bouton quand le mouvement est accepté", () => {
    const selecteur = '[data-slot="button"]'
    const regles = reglesDuSelecteur(feuille, selecteur).filter(estHorsCouche)
    const requete = "(prefers-reduced-motion: no-preference)"
    const regle = regles.find(
      (candidate) => requeteMedia(candidate)?.params.trim() === requete
    )
    assert(regle, `${selecteur} n'a pas de règle dans ${requete}`)

    const proprietes = proprietesDeTransition(regle)
    expect(proprietes).not.toContain("all")
    expect(proprietes).toContain("translate")
  })

  it("place les règles nommées hors couche après la dernière @layer utilities pour qu'elles l'emportent", () => {
    const coucheUtilities = derniereCoucheUtilities(feuille)
    expect(coucheUtilities).toBeGreaterThanOrEqual(0)

    const reglesNommees = PRIMITIVES_TRANSITEES.flatMap((primitive) =>
      reglesDuSelecteur(feuille, `[data-slot="${primitive.slot}"]`).filter(
        estHorsCouche
      )
    )

    expect(reglesNommees.length).toBeGreaterThan(0)

    for (const regle of reglesNommees) {
      expect(positionDansLaFeuille(feuille, regle)).toBeGreaterThan(
        coucheUtilities
      )
    }
  })
})
