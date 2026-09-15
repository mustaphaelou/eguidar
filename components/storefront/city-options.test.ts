import { describe, expect, it } from "vitest"

import { cityOptions } from "./city-options"

const VILLES = [
  { id: "casa-1", slug: "casablanca", name: "Casablanca", fee: 2500 },
  { id: "kenitra-1", slug: "kenitra", name: "Kénitra", fee: 0 },
]

describe("cityOptions", () => {
  it("porte la valeur interne, le nom seul en label et « nom — frais » en option", () => {
    expect(cityOptions(VILLES)).toEqual([
      {
        value: "casa-1",
        label: "Casablanca",
        optionLabel: "Casablanca — 25,00\u00A0MAD",
      },
      {
        value: "kenitra-1",
        label: "Kénitra",
        optionLabel: "Kénitra — Livraison offerte",
      },
    ])
  })

  it("garde le label du déclencheur sans frais alors que l'option les porte", () => {
    const [casablanca] = cityOptions(VILLES)

    expect(casablanca.label).toBe("Casablanca")
    expect(casablanca.label).not.toContain("MAD")
    expect(casablanca.optionLabel).toContain("Casablanca — ")
  })

  it("rend « Livraison offerte » quand les frais sont nuls", () => {
    const [, kenitra] = cityOptions(VILLES)

    expect(kenitra.optionLabel).toBe("Kénitra — Livraison offerte")
    expect(kenitra.optionLabel).not.toContain("0,00")
  })

  it("ne renvoie aucune ligne quand aucune Ville n'est chargée", () => {
    expect(cityOptions([])).toEqual([])
  })
})
