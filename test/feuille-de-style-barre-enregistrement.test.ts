import { readFile } from "node:fs/promises"
import path from "node:path"

import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  estDansLaCoucheBase,
  reglesDuSelecteur,
  valeurDe,
  valeurNormalisee,
  valeursDe,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

const HAUTEUR = "--hauteur-barre-enregistrement"

function reglesDeBase(
  feuille: FeuilleDeStyleCompilee,
  selecteur: string
): Rule[] {
  return reglesDuSelecteur(feuille, selecteur).filter(estDansLaCoucheBase)
}

function regleDuFocus(feuille: FeuilleDeStyleCompilee): Rule | undefined {
  let trouvee: Rule | undefined

  feuille.racine.walkRules((regle) => {
    if (
      regle.selector.includes("formulaire-produit") &&
      regle.selector.includes(":focus-visible")
    ) {
      trouvee = regle
    }
  })

  return trouvee
}

describe("le focus sous la barre d'enregistrement collante", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("déclare une seule hauteur de barre, dans la racine de base", () => {
    const racines = reglesDeBase(feuille, ":root")
    const hauteurs = racines.flatMap((racine) => valeursDe(racine, HAUTEUR))

    expect(hauteurs).toEqual(["4rem"])
  })

  it("réserve sous la fenêtre la hauteur de la barre, pour tout élément ramené au focus", () => {
    const html = reglesDeBase(feuille, "html").find(
      (regle) => regle.selector.trim() === "html"
    )

    expect(valeurDe(html!, "scroll-padding-bottom")).toBe(`var(${HAUTEUR})`)
  })

  it("donne à la barre elle-même la hauteur que la marge réserve", () => {
    const regles = reglesDuSelecteur(feuille, ".barre-enregistrement")

    expect(regles).toHaveLength(1)
    expect(valeurDe(regles[0], "min-height")).toBe(`var(${HAUTEUR})`)
  })

  it("décale le contrôle focalisé du formulaire de la même hauteur, plus une respiration", () => {
    const regle = regleDuFocus(feuille)

    expect(regle).toBeDefined()
    expect(valeurNormalisee(valeurDe(regle!, "scroll-margin-bottom")!)).toBe(
      `calc(var(${HAUTEUR}) + 0.75rem)`
    )
  })

  it("branche le contrat sur le formulaire du Produit et sa barre", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "components/admin/product-form.tsx"),
      "utf8"
    )

    expect(source).toContain("formulaire-produit")
    expect(source).toContain("barre-enregistrement")
  })
})
