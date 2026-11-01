import { describe, expect, it } from "vitest"

import {
  ORIGINES_DE_LA_BOUTIQUE,
  originesSupplementaires,
} from "./origines-de-confiance"

describe("origines de confiance", () => {
  it("écrit l'apex et www dans le dépôt", () => {
    expect(ORIGINES_DE_LA_BOUTIQUE).toEqual([
      "https://eguidar.com",
      "https://www.eguidar.com",
    ])
  })

  it("n'ajoute aucune prévisualisation quand le déploiement n'en déclare pas", () => {
    expect(originesSupplementaires("")).toEqual([])
  })

  it("lit les origines de prévisualisation du déploiement", () => {
    expect(
      originesSupplementaires(
        "https://preview.example, https://preview2.example"
      )
    ).toEqual(["https://preview.example", "https://preview2.example"])
  })

  it("nomme une origine malformée au lieu de la taire", () => {
    expect(() => originesSupplementaires("pas-une-origine")).toThrow(
      "origine invalide"
    )
  })

  it("refuse une origine qui n'est pas HTTP", () => {
    expect(() => originesSupplementaires("mailto:contact@eguidar.com")).toThrow(
      "origine non HTTP"
    )
  })
})
