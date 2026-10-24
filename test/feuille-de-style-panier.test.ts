import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  estDansRequete,
  estHorsRequete,
  reglesDuSelecteur,
  type FeuilleDeStyleCompilee,
  valeursDe,
} from "./feuille-de-style"

const REQUETE_MOUVEMENT_ACCEPTE = "(prefers-reduced-motion: no-preference)"
const REQUETE_MOUVEMENT_REFUSE = "(prefers-reduced-motion: reduce)"

const SELECTEUR_ICONE = '[data-slot="icone-du-panier"]'
const SELECTEUR_OUVERTURE = `${SELECTEUR_ICONE}[data-mouvement="ouverture"]`
const SELECTEUR_FERMETURE = `${SELECTEUR_ICONE}[data-mouvement="fermeture"]`

function imagesDe(feuille: FeuilleDeStyleCompilee, nom: string): Rule[] {
  const images: Rule[] = []

  feuille.racine.walkAtRules("keyframes", (arobase) => {
    if (arobase.params.trim() !== nom) return
    arobase.walkRules((image) => {
      images.push(image)
    })
  })

  return images
}

describe("le ressort de l'icône du Panier", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("ne joue qu'au clic, et seulement quand le mouvement est accepté", () => {
    for (const [selecteur, nom, duree] of [
      [SELECTEUR_OUVERTURE, "panier-ouverture", "520ms"],
      [SELECTEUR_FERMETURE, "panier-fermeture", "420ms"],
    ] as const) {
      const regles = reglesDuSelecteur(feuille, selecteur)
      const acceptees = regles.filter((regle) =>
        estDansRequete(regle, REQUETE_MOUVEMENT_ACCEPTE)
      )

      expect(valeursDe(acceptees, "animation-name")).toEqual([nom])
      expect(valeursDe(acceptees, "animation-duration")).toEqual([duree])
      expect(valeursDe(acceptees, "animation-timing-function")).toEqual([
        "linear",
      ])
      expect(regles.filter(estHorsRequete)).toEqual([])
      expect(
        regles.filter((regle) =>
          estDansRequete(regle, REQUETE_MOUVEMENT_REFUSE)
        )
      ).toEqual([])
    }
  })

  it("s'enfonce sous l'appui, jaillit au-delà, puis se pose à l'ouverture", () => {
    const images = imagesDe(feuille, "panier-ouverture")
    const echelles = valeursDe(images, "scale")
    const rotations = valeursDe(images, "rotate")

    expect(echelles[0]).toBe("0.86")
    expect(echelles).toContain("1.061")
    expect(echelles.at(-1)).toBe("1")
    expect(rotations).toContain("-5deg")
    expect(rotations.at(-1)).toBe("0deg")
  })

  it("revient de l'appui avec un rebond plus court à la fermeture", () => {
    const images = imagesDe(feuille, "panier-fermeture")
    const echelles = valeursDe(images, "scale")
    const rotations = valeursDe(images, "rotate")

    expect(echelles[0]).toBe("0.9")
    expect(echelles).toContain("1.045")
    expect(echelles.at(-1)).toBe("1")
    expect(rotations).toContain("3deg")
    expect(rotations.at(-1)).toBe("0deg")
  })

  it("rend l'échelle au bouton une fois le ressort posé", () => {
    for (const selecteur of [SELECTEUR_OUVERTURE, SELECTEUR_FERMETURE]) {
      const regles = reglesDuSelecteur(feuille, selecteur)

      expect(valeursDe(regles, "animation-fill-mode")).toEqual([])
    }
  })
})
