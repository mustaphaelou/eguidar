import assert from "node:assert/strict"

import { beforeAll, describe, expect, it } from "vitest"
import type { AtRule, Declaration, Node, Root, Rule } from "postcss"

import {
  compilerLaFeuilleDeStyle,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

type Role = {
  slot: string
  proprietes: string[]
}

const roles: Role[] = [
  {
    slot: "button",
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
    proprietes: ["background-color", "border-color", "box-shadow", "opacity"],
  },
  {
    slot: "accordion-trigger",
    proprietes: ["color", "text-decoration-color", "opacity"],
  },
  {
    slot: "badge",
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

function estAtRule(noeud: Node): noeud is AtRule {
  return noeud.type === "atrule"
}

function estHorsCouche(regle: Rule): boolean {
  let parent: Node | undefined = regle.parent
  while (parent) {
    if (estAtRule(parent) && parent.name === "layer") return false
    parent = parent.parent
  }
  return true
}

function requeteMedia(regle: Rule): AtRule | undefined {
  let parent: Node | undefined = regle.parent
  while (parent) {
    if (estAtRule(parent) && parent.name === "media") return parent
    parent = parent.parent
  }
  return undefined
}

function reglesDuSelecteur(racine: Root, selecteur: string): Rule[] {
  const regles: Rule[] = []
  racine.walkRules((regle) => {
    if (regle.selector === selecteur) regles.push(regle)
  })
  return regles
}

function reglesHorsCouche(regles: Rule[]): Rule[] {
  return regles.filter(estHorsCouche)
}

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

describe("les transitions nomment leurs propriétés", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  for (const role of roles) {
    it(`nomme, hors de toute couche, les propriétés animées par ${role.slot}`, () => {
      const selecteur = `[data-slot="${role.slot}"]`
      const regles = reglesHorsCouche(
        reglesDuSelecteur(feuille.racine, selecteur)
      )
      const regle = regleSansRequete(regles)
      assert(regle, `${selecteur} n'a pas de règle hors couche`)

      const proprietes = proprietesDeTransition(regle)
      expect(proprietes).not.toContain("all")
      for (const propriete of role.proprietes) {
        expect(proprietes).toContain(propriete)
      }
    })
  }

  it("n'anime pas la pression du bouton quand le mouvement est refusé", () => {
    const selecteur = '[data-slot="button"]'
    const regles = reglesHorsCouche(
      reglesDuSelecteur(feuille.racine, selecteur)
    )
    const regle = regleSansRequete(regles)
    assert(regle, `${selecteur} n'a pas de règle hors couche`)

    expect(proprietesDeTransition(regle)).not.toContain("translate")
  })

  it("ajoute la pression du bouton quand le mouvement est accepté", () => {
    const selecteur = '[data-slot="button"]'
    const regles = reglesHorsCouche(
      reglesDuSelecteur(feuille.racine, selecteur)
    )
    const requete = "(prefers-reduced-motion: no-preference)"
    const regle = regles.find((candidate) => {
      const media = requeteMedia(candidate)
      return media?.params.replace(/\s+/g, " ").trim() === requete
    })
    assert(regle, `${selecteur} n'a pas de règle dans ${requete}`)

    const proprietes = proprietesDeTransition(regle)
    expect(proprietes).not.toContain("all")
    expect(proprietes).toContain("translate")
  })
})
