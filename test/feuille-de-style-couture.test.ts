import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

describe("la feuille de style compilée", () => {
  let feuille: FeuilleDeStyleCompilee
  let dureeCompilation: number

  beforeAll(async () => {
    const debut = performance.now()
    feuille = await compilerLaFeuilleDeStyle()
    dureeCompilation = performance.now() - debut
  })

  it("expose le CSS émis par la feuille de style du projet", () => {
    expect(feuille.css).toContain(".voile-depoli")
  })

  it("expose l'arbre syntaxique du CSS émis", () => {
    const selecteurs: string[] = []
    feuille.racine.walkRules((regle) => {
      selecteurs.push(regle.selector)
    })

    expect(selecteurs).toContain(".voile-depoli")
  })

  it("compile la feuille de style du projet dans le budget de la suite", () => {
    expect(dureeCompilation).toBeLessThan(5000)
  })
})
