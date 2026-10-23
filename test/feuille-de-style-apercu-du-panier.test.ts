import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  estDansRequete,
  estHorsRequete,
  mediaDe,
  reglesDuSelecteur,
  type FeuilleDeStyleCompilee,
  valeursDe,
} from "./feuille-de-style"

const REQUETE_MOUVEMENT_ACCEPTE = "(prefers-reduced-motion: no-preference)"
const REQUETE_MOUVEMENT_REFUSE = "(prefers-reduced-motion: reduce)"

const SELECTEUR_FEUILLE = '[data-slot="apercu-du-panier"]'
const SELECTEUR_LIGNE = '[data-slot="apercu-du-panier-ligne"]'
const SELECTEUR_VOILE = '[data-slot="voile-sombre"]'

function reglesDe(feuille: FeuilleDeStyleCompilee, selecteur: string): Rule[] {
  return reglesDuSelecteur(feuille, selecteur)
}

function horsRequete(regles: Rule[]): Rule[] {
  return regles.filter(estHorsRequete)
}

function dansRequete(regles: Rule[], requete: string): Rule[] {
  return regles.filter((regle) => estDansRequete(regle, requete))
}

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

function declarationsDe(regles: Rule[]): string[] {
  const declarations: string[] = []

  for (const regle of regles) {
    regle.walkDecls((declaration) => {
      declarations.push(declaration.prop)
    })
  }

  return declarations
}

function proprietesDesImages(
  feuille: FeuilleDeStyleCompilee,
  nom: string
): string[] {
  return declarationsDe(imagesDe(feuille, nom))
}

describe("la feuille de l'Aperçu du Panier", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("ouvre sur sa hauteur en cubic-bezier(.4,0,.6,1), seulement quand le mouvement est accepté", () => {
    const regles = reglesDe(feuille, SELECTEUR_FEUILLE)
    const acceptees = dansRequete(regles, REQUETE_MOUVEMENT_ACCEPTE)

    expect(valeursDe(acceptees, "animation-name")).toEqual(["apercu-hauteur"])
    expect(valeursDe(acceptees, "animation-duration")).toEqual(["320ms"])
    expect(valeursDe(acceptees, "animation-timing-function")).toEqual([
      "cubic-bezier(.4,0,.6,1)",
    ])

    const images = imagesDe(feuille, "apercu-hauteur")
    expect(valeursDe(images, "height")).toEqual(["0", "auto"])

    expect(valeursDe(horsRequete(regles), "animation-name")).toEqual([])
    expect(dansRequete(regles, REQUETE_MOUVEMENT_REFUSE)).toEqual([])
  })

  it("n'anime ni max-height, ni grille, ni transform sur la feuille", () => {
    const declarations = declarationsDe(reglesDe(feuille, SELECTEUR_FEUILLE))

    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations).not.toContain("max-height")
    expect(declarations).not.toContain("grid-template-rows")
    expect(declarations).not.toContain("transform")
    expect(declarations).not.toContain("transition")
  })
})

describe("les lignes de l'Aperçu du Panier", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("s'estompent en montant de translateY(-4px), seulement quand le mouvement est accepté", () => {
    const regles = reglesDe(feuille, SELECTEUR_LIGNE)
    const acceptees = dansRequete(regles, REQUETE_MOUVEMENT_ACCEPTE)

    expect(valeursDe(acceptees, "animation-name")).toEqual(["apercu-ligne"])
    expect(valeursDe(acceptees, "animation-duration")).toEqual(["320ms"])
    expect(valeursDe(acceptees, "animation-fill-mode")).toEqual(["both"])

    expect(valeursDe(horsRequete(regles), "animation-name")).toEqual([])
    expect(valeursDe(horsRequete(regles), "opacity")).toEqual([])
    expect(valeursDe(horsRequete(regles), "transform")).toEqual([])
    expect(dansRequete(regles, REQUETE_MOUVEMENT_REFUSE)).toEqual([])
  })

  it("part de l'opacité nulle et du décalage de -4px pour se poser visible", () => {
    const images = imagesDe(feuille, "apercu-ligne")

    expect(valeursDe(images, "opacity")).toEqual(["0", "1"])
    expect(valeursDe(images, "transform")).toEqual(["translateY(-4px)", "none"])
  })

  it("décale chaque ligne de 20 ms à partir de son rang", () => {
    const acceptees = dansRequete(
      reglesDe(feuille, SELECTEUR_LIGNE),
      REQUETE_MOUVEMENT_ACCEPTE
    )

    expect(valeursDe(acceptees, "animation-delay")).toEqual([
      "calc(var(--rang-ligne, 0) * 20ms)",
    ])
  })
})

describe("le Voile sombre de l'Aperçu du Panier", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("fond sur son opacité en 320 ms après 80 ms", () => {
    const regles = reglesDe(feuille, SELECTEUR_VOILE)

    expect(regles.length).toBeGreaterThan(0)
    expect(valeursDe(regles, "animation-name")).toEqual(["apercu-voile"])
    expect(valeursDe(regles, "animation-duration")).toEqual(["320ms"])
    expect(valeursDe(regles, "animation-delay")).toEqual(["80ms"])
    expect(valeursDe(regles, "animation-fill-mode")).toEqual(["both"])

    const images = imagesDe(feuille, "apercu-voile")
    expect(valeursDe(images, "opacity")).toEqual(["0", "1"])
    expect(valeursDe(images, "transform")).toEqual([])
  })
})

describe("le mouvement de l'Aperçu du Panier", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("ne bouge que la hauteur de la feuille, le transform et l'opacité", () => {
    const proprietes: string[] = []

    feuille.racine.walkAtRules("keyframes", (arobase) => {
      if (!arobase.params.trim().startsWith("apercu-")) return
      arobase.walkDecls((declaration) => {
        proprietes.push(declaration.prop)
      })
    })

    expect([...new Set(proprietes)].sort()).toEqual([
      "height",
      "opacity",
      "transform",
    ])
  })

  it("vise la hauteur d'écran de la feuille mobile pour ne pas se poser puis sauter", () => {
    const mobiles = reglesDe(feuille, SELECTEUR_FEUILLE).filter((regle) =>
      mediaDe(regle).some((requete) => requete.includes("width < 64rem"))
    )

    expect(valeursDe(mobiles, "animation-name")).toEqual([
      "apercu-hauteur-mobile",
    ])
    expect(
      valeursDe(imagesDe(feuille, "apercu-hauteur-mobile"), "height")
    ).toEqual(["0", "100dvh"])
  })

  it("laisse la feuille et les lignes immédiatement utilisables sous mouvement réduit", () => {
    for (const selecteur of [SELECTEUR_FEUILLE, SELECTEUR_LIGNE]) {
      const regles = reglesDe(feuille, selecteur)
      const hors = horsRequete(regles)

      expect(dansRequete(regles, REQUETE_MOUVEMENT_REFUSE)).toEqual([])
      expect(valeursDe(hors, "animation")).toEqual([])
      expect(valeursDe(hors, "animation-name")).toEqual([])
      expect(valeursDe(hors, "opacity")).toEqual([])
      expect(valeursDe(hors, "transform")).toEqual([])
      expect(valeursDe(hors, "transition-property")).toEqual([])
    }

    expect(
      valeursDe(reglesDe(feuille, SELECTEUR_VOILE), "animation-name")
    ).toEqual(["apercu-voile"])
    expect(proprietesDesImages(feuille, "apercu-voile")).toEqual([
      "opacity",
      "opacity",
    ])
  })
})
