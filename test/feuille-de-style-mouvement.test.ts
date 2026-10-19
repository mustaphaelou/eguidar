import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  estDansRequete,
  estHorsRequete,
  reglesDuSelecteur,
  selecteursDe,
  type FeuilleDeStyleCompilee,
  valeursDe,
} from "./feuille-de-style"

const REQUETE_MOUVEMENT_ACCEPTE = "(prefers-reduced-motion: no-preference)"
const REQUETE_MOUVEMENT_REFUSE = "(prefers-reduced-motion: reduce)"

const SURFACES_QUI_S_OUVRENT = [
  "dialog-content",
  "popover-content",
  "dropdown-menu-content",
  "select-content",
  "tooltip-content",
  "sidebar",
  "switch-thumb",
]

const VOILES_QUI_FONDENT = ["dialog-overlay", "sidebar-overlay"]

function reglesDuSlot(
  feuille: FeuilleDeStyleCompilee,
  slot: string,
  requete?: string
): Rule[] {
  return reglesDuSelecteur(feuille, `[data-slot="${slot}"]`).filter((regle) =>
    requete === undefined
      ? estHorsRequete(regle)
      : estDansRequete(regle, requete)
  )
}

function proprietesDe(regles: Rule[]): string[] {
  return valeursDe(regles, "transition-property").flatMap((valeur) =>
    valeur.split(",").map((propriete) => propriete.trim())
  )
}

describe("le mouvement des surfaces est opt-in", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("ne nomme que le fondu dans la règle de base du tiroir", () => {
    const regles = reglesDuSlot(feuille, "drawer-popup")

    expect(proprietesDe(regles)).toEqual(["opacity"])
  })

  it("ajoute la glissade et la hauteur du tiroir quand le mouvement est accepté", () => {
    const regles = reglesDuSlot(
      feuille,
      "drawer-popup",
      REQUETE_MOUVEMENT_ACCEPTE
    )

    expect(proprietesDe(regles)).toEqual(
      expect.arrayContaining(["transform", "height", "opacity", "filter"])
    )
  })

  it("garde le fondu du tiroir à toutes les préférences de mouvement", () => {
    expect(
      reglesDuSlot(feuille, "drawer-popup", REQUETE_MOUVEMENT_REFUSE)
    ).toEqual([])
  })

  it("éteint l'animation et la transition des surfaces qui s'ouvrent quand le mouvement est refusé", () => {
    for (const slot of SURFACES_QUI_S_OUVRENT) {
      const regles = reglesDuSlot(feuille, slot, REQUETE_MOUVEMENT_REFUSE)

      expect(valeursDe(regles, "animation")).toEqual(["none"])
      expect(valeursDe(regles, "transition")).toEqual(["none"])
    }
  })

  it("laisse les voiles garder leur fondu quand le mouvement est refusé", () => {
    for (const slot of VOILES_QUI_FONDENT) {
      expect(reglesDuSlot(feuille, slot, REQUETE_MOUVEMENT_REFUSE)).toEqual([])
    }

    const selecteurs = selecteursDe(feuille)

    expect(
      selecteurs.some((selecteur) => selecteur.includes("fade-in-0"))
    ).toBe(true)
    expect(
      selecteurs.some((selecteur) => selecteur.includes("fade-out-0"))
    ).toBe(true)
  })
})
