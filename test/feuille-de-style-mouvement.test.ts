import { beforeAll, describe, expect, it } from "vitest"
import type { AnyNode, Rule } from "postcss"

import {
  compilerLaFeuilleDeStyle,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

const REQUETE_MOUVEMENT_ACCEPTE = "(prefers-reduced-motion: no-preference)"
const REQUETE_MOUVEMENT_REFUSE = "(prefers-reduced-motion: reduce)"

const SURFACES_QUI_S_OUVRENT = [
  "dialog-content",
  "dialog-overlay",
  "popover-content",
  "dropdown-menu-content",
  "select-content",
  "tooltip-content",
  "sidebar",
  "sidebar-overlay",
  "switch-thumb",
]

function estDansRequete(regle: Rule, requete: string): boolean {
  let parent: AnyNode | undefined = regle.parent

  while (parent) {
    if (
      parent.type === "atrule" &&
      parent.name === "media" &&
      parent.params === requete
    ) {
      return true
    }

    parent = parent.parent
  }

  return false
}

function estHorsRequete(regle: Rule): boolean {
  let parent: AnyNode | undefined = regle.parent

  while (parent) {
    if (parent.type === "atrule" && parent.name === "media") {
      return false
    }

    parent = parent.parent
  }

  return true
}

function reglesDuSlot(
  feuille: FeuilleDeStyleCompilee,
  slot: string,
  requete?: string
): Rule[] {
  const selecteur = `[data-slot="${slot}"]`
  const regles: Rule[] = []

  feuille.racine.walkRules((regle) => {
    if (!regle.selectors.includes(selecteur)) {
      return
    }

    if (
      requete === undefined
        ? estHorsRequete(regle)
        : estDansRequete(regle, requete)
    ) {
      regles.push(regle)
    }
  })

  return regles
}

function valeursDe(regles: Rule[], propriete: string): string[] {
  return regles.flatMap((regle) => {
    const valeurs: string[] = []

    regle.walkDecls(propriete, (declaration) => {
      valeurs.push(declaration.value.trim())
    })

    return valeurs
  })
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
})
