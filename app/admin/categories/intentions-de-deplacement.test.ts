import { describe, expect, it } from "vitest"

import { intentionsDeDeplacement } from "@/app/admin/categories/intentions-de-deplacement"

function ligne(
  id: string,
  parentId: string | null,
  horsArbre = false
): { id: string; parentId: string | null; horsArbre: boolean } {
  return { id, parentId, horsArbre }
}

describe("intentionsDeDeplacement — une intention par geste, jamais une position", () => {
  // L'ordre reçu est celui de la Lecture : volontairement à l'envers de
  // l'alphabet, pour que l'adjacence vienne de la fratrie et non d'un tri.
  const LIGNES = [
    ligne("zebre", null),
    ligne("alpha", null),
    ligne("ecran", null),
    ligne("petit-zebre", "zebre"),
    ligne("petit-alpha", "alpha"),
  ]

  it("lit la fratrie rendue par la Lecture, sans la re-ranger", () => {
    const intentions = intentionsDeDeplacement(LIGNES)

    expect(intentions.get("alpha")?.monter).toEqual({
      nouvelleParenteId: null,
      avantId: "zebre",
    })
    expect(intentions.get("zebre")?.descendre).toEqual({
      nouvelleParenteId: null,
      avantId: "ecran",
    })
    expect(intentions.get("alpha")?.descendre).toEqual({
      nouvelleParenteId: null,
      avantId: null,
    })
    expect(intentions.get("ecran")?.descendre).toBeNull()
    expect(intentions.get("zebre")?.monter).toBeNull()
  })

  it("indente sous la sœur précédente, en dernier enfant", () => {
    const intentions = intentionsDeDeplacement(LIGNES)

    expect(intentions.get("ecran")?.indenter).toEqual({
      nouvelleParenteId: "alpha",
      avantId: null,
    })
    expect(intentions.get("zebre")?.indenter).toBeNull()
  })

  it("désindente sous la grand-mère, avant la sœur suivante de la parente", () => {
    const intentions = intentionsDeDeplacement(LIGNES)

    expect(intentions.get("petit-alpha")?.desindenter).toEqual({
      nouvelleParenteId: null,
      avantId: "ecran",
    })
    expect(intentions.get("petit-zebre")?.desindenter).toEqual({
      nouvelleParenteId: null,
      avantId: "alpha",
    })
    expect(intentions.get("alpha")?.desindenter).toBeNull()
  })

  it("ne rend aucune intention de déplacement pour une Structure hors arbre", () => {
    const intentions = intentionsDeDeplacement([
      ...LIGNES,
      ligne("hors", "zebre", true),
    ])

    expect(intentions.get("hors")).toEqual({
      monter: null,
      descendre: null,
      indenter: null,
      desindenter: null,
    })
  })

  it("ne porte jamais de position : seulement la destination et l'insertion", () => {
    const intentions = intentionsDeDeplacement(LIGNES)

    for (const gestes of intentions.values()) {
      for (const cible of Object.values(gestes)) {
        if (cible === null) continue
        expect(Object.keys(cible).sort()).toEqual([
          "avantId",
          "nouvelleParenteId",
        ])
        expect(cible).not.toHaveProperty("position")
      }
    }
  })
})
