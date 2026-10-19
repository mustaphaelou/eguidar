import type { AtRule, Container, Document, Rule } from "postcss"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { viewport } from "../app/layout"
import {
  compilerLaFeuilleDeStyle,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

vi.mock("next/font/google", () => ({
  Geist_Mono: () => ({ variable: "--font-mono" }),
}))

const SELECTEURS_DE_BASE = ["*", "*::before", "*::after"]

function estDansLaCoucheBase(noeud: Container | Document): boolean {
  let parent = noeud.parent

  while (parent) {
    if (parent.type === "atrule") {
      const couche = parent as AtRule

      if (couche.name === "layer" && couche.params === "base") {
        return true
      }
    }

    parent = parent.parent
  }

  return false
}

function regleDeBase(feuille: FeuilleDeStyleCompilee): Rule {
  let trouvee: Rule | undefined

  feuille.racine.walkRules((regle) => {
    const selecteurs = regle.selector.split(",").map((s) => s.trim())

    if (
      selecteurs.length === SELECTEURS_DE_BASE.length &&
      SELECTEURS_DE_BASE.every((s) => selecteurs.includes(s)) &&
      estDansLaCoucheBase(regle)
    ) {
      trouvee = regle
    }
  })

  if (!trouvee) throw new Error("la règle de base est absente du CSS émis")

  return trouvee
}

function racineDeBase(feuille: FeuilleDeStyleCompilee): Rule {
  let trouvee: Rule | undefined

  feuille.racine.walkRules((regle) => {
    if (regle.selector.trim() === ":root" && estDansLaCoucheBase(regle)) {
      trouvee = regle
    }
  })

  if (!trouvee) throw new Error("la racine de base est absente du CSS émis")

  return trouvee
}

function valeursDe(regle: Rule, propriete: string): string[] {
  const valeurs: string[] = []

  regle.walkDecls(propriete, (declaration) => {
    valeurs.push(declaration.value.trim())
  })

  return valeurs
}

describe("la base de la feuille de style", () => {
  let feuille: FeuilleDeStyleCompilee
  let base: Rule
  let racine: Rule

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
    base = regleDeBase(feuille)
    racine = racineDeBase(feuille)
  })

  it("donne à tout élément une largeur minimale nulle pour qu'une image dimensionnée rétrécisse dans une rangée flex", () => {
    expect(valeursDe(base, "min-width")).toContain("0")
  })

  it("réserve la largeur de la barre de défilement dans la racine pour que la page ne se décale pas quand une modale verrouille le défilement", () => {
    expect(valeursDe(racine, "scrollbar-gutter")).toContain("stable")
  })

  it("laisse la Barre d'achat et les modales demander l'inset inférieur de la zone sûre", () => {
    expect(feuille.css).toContain("env(safe-area-inset-bottom)")
  })
})

describe("la fenêtre de la page", () => {
  it("demande la largeur de l'appareil, une échelle initiale de un et la couverture, ce que ni le CSS compilé ni la liste de classes ne voient", () => {
    expect(viewport).toEqual({
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
    })
  })
})
