import type { Rule } from "postcss"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { viewport } from "../app/layout"
import {
  compilerLaFeuilleDeStyle,
  declarationsDe,
  estDansLaCoucheBase,
  regleDeBase,
  type FeuilleDeStyleCompilee,
  valeurNormalisee,
  valeursDe,
} from "./feuille-de-style"

vi.mock("next/font/google", () => ({
  Geist_Mono: () => ({ variable: "--font-mono" }),
}))

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

  it("laisse la Barre d'achat et les modales demander l'inset inférieur de la zone sûre dans deux règles distinctes", () => {
    const porteurs = declarationsDe(feuille, "padding-bottom")
      .filter((declaration) =>
        declaration.value.includes("env(safe-area-inset-bottom)")
      )
      .map((declaration) => ({
        selecteur:
          declaration.parent?.type === "rule"
            ? declaration.parent.selector
            : undefined,
        valeur: valeurNormalisee(declaration.value),
      }))

    const barre = porteurs.find(
      (porteur) => porteur.valeur === "max(1rem, env(safe-area-inset-bottom))"
    )
    const modale = porteurs.find(
      (porteur) => porteur.valeur === "max(1.5rem, env(safe-area-inset-bottom))"
    )

    expect(barre).toBeDefined()
    expect(modale).toBeDefined()
    expect(barre?.selecteur).not.toBe(modale?.selecteur)
    expect(
      new Set(porteurs.map((porteur) => porteur.selecteur)).size
    ).toBeGreaterThanOrEqual(2)
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
