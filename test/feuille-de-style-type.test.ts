import type { Declaration } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  declarationsDe,
  estDansLaRacine,
  type FeuilleDeStyleCompilee,
  valeurNormalisee,
} from "./feuille-de-style"

const JETONS: Record<string, string> = {
  "--text-hero": "clamp(1.5rem, 10.5cqi, 3.5rem)",
  "--text-hero--line-height": "1.02",
  "--text-hero--letter-spacing": "-0.031em",
  "--text-chiffre": "clamp(0.9rem, 4cqi, 1.25rem)",
  "--text-chiffre--line-height": "1.1",
  "--text-chiffre--letter-spacing": "-0.01em",
}

function declarationsDuTheme(
  feuille: FeuilleDeStyleCompilee,
  nom: string
): Declaration[] {
  return declarationsDe(feuille, nom).filter(
    (declaration) => !estDansLaRacine(declaration)
  )
}

function declarationsRacine(
  feuille: FeuilleDeStyleCompilee,
  nom: string
): Declaration[] {
  return declarationsDe(feuille, nom).filter((declaration) =>
    estDansLaRacine(declaration)
  )
}

describe("les jetons de type du Cadre de l'Administration", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it.each(Object.entries(JETONS))(
    "enregistre %s dans le thème et lui donne sa valeur dans la racine",
    (nom, valeur) => {
      const theme = declarationsDuTheme(feuille, nom)
      const racine = declarationsRacine(feuille, nom)

      expect(theme).toHaveLength(1)
      expect(valeurNormalisee(theme[0]!.value)).toBe(`var(${nom})`)
      expect(racine).toHaveLength(1)
      expect(valeurNormalisee(racine[0]!.value)).toBe(valeur)
    }
  )

  it("laisse les jetons de type déjà présents intacts", () => {
    const existants: Record<string, string> = {
      "--text-body": "1rem",
      "--leading-body": "1.471",
      "--text-titre-carte": "clamp(1.647rem, 0.47rem + 2.9412vw, 2.353rem)",
      "--text-titre-catalogue": "clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem)",
    }

    for (const [nom, valeur] of Object.entries(existants)) {
      expect(declarationsDuTheme(feuille, nom)).toHaveLength(1)
      expect(valeurNormalisee(declarationsRacine(feuille, nom)[0]!.value)).toBe(
        valeur
      )
    }
  })
})
