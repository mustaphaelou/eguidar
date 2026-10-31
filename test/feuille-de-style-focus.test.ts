import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import type { Rule } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  declarationsDe,
  estDansLaCoucheBase,
  reglesDuSelecteur,
  type FeuilleDeStyleCompilee,
  valeurDe,
  valeurNormalisee,
} from "./feuille-de-style"

function valeurDuJeton(feuille: FeuilleDeStyleCompilee, jeton: string): string {
  const declarations = declarationsDe(feuille, jeton)

  expect(declarations).toHaveLength(1)

  return valeurNormalisee(declarations[0].value)
}

function fichiersSource(dossier: string): string[] {
  return readdirSync(path.resolve(process.cwd(), dossier), {
    recursive: true,
    encoding: "utf8",
  })
    .filter((fichier) => fichier.endsWith(".ts") || fichier.endsWith(".tsx"))
    .map((fichier) => path.join(dossier, fichier))
}

function regleDeFocus(feuille: FeuilleDeStyleCompilee): Rule {
  const regles = reglesDuSelecteur(feuille, ":focus-visible").filter(
    estDansLaCoucheBase
  )

  expect(regles).toHaveLength(1)

  return regles[0]
}

describe("l'anneau de focus global", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("se dessine dans la base en 2 px opaques de #0071e3", () => {
    expect(valeurDe(regleDeFocus(feuille), "outline")).toBe("2px solid #0071e3")
  })

  it("se décolle de 1 px du contour", () => {
    expect(valeurDe(regleDeFocus(feuille), "outline-offset")).toBe("1px")
  })

  it("garde une couleur pleine, sans mélange translucide", () => {
    const contour = valeurDe(regleDeFocus(feuille), "outline") ?? ""
    const couleur = contour.split(" ").at(-1)

    expect(couleur).toBe("#0071e3")
    expect(contour).not.toMatch(/transparent|color-mix/)
  })

  it("retire le jeton translucide et toute référence dans la base", () => {
    expect(declarationsDe(feuille, "--ring-attenue")).toEqual([])

    const contours = declarationsDe(feuille, "outline-color").map(
      (declaration) => valeurNormalisee(declaration.value)
    )

    expect(contours).not.toContain("var(--ring-attenue)")
  })

  it("porte le bleu Apple opaque dans le jeton d'anneau", () => {
    expect(valeurDuJeton(feuille, "--ring")).toBe("#0071e3")
  })

  it("garde le même bleu opaque pour l'anneau de la barre latérale", () => {
    expect(valeurDuJeton(feuille, "--sidebar-ring")).toBe("#0071e3")
  })

  it("ne mélange plus la couleur de l'anneau avec de la transparence", () => {
    const [declaration] = declarationsDe(feuille, "--ring")

    expect(valeurNormalisee(declaration.value)).not.toMatch(
      /color-mix|transparent/
    )
  })
})

describe("les primitives de l'interface", () => {
  it("n'utilisent plus l'anneau de focus translucide", () => {
    const sources = [...fichiersSource("app"), ...fichiersSource("components")]
    const coupables = sources.filter((fichier) =>
      readFileSync(fichier, "utf8").includes("ring-ring/50")
    )

    expect(coupables).toEqual([])
  })
})
