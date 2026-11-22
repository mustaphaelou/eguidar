import { describe, expect, it } from "vitest"

import {
  specificationsAffichees,
  type FaitsDeFicheProduit,
} from "@/lib/fiche-produit"

function faits(
  overrides: Partial<FaitsDeFicheProduit> = {}
): FaitsDeFicheProduit {
  return {
    brand: "Apple",
    specs: {},
    categoryName: "Smartphones",
    variants: [
      { name: "Burgundy", stock: 0 },
      { name: "Glacier", stock: 1 },
    ],
    freeShipping: false,
    ...overrides,
  }
}

describe("specificationsAffichees", () => {
  it("ajoute les faits de base après les spécifications du Catalogue", () => {
    const specifications = specificationsAffichees(
      faits({ specs: { Écran: '6.9" Super Retina XDR', Puce: "A18 Pro" } })
    )

    expect(specifications).toEqual([
      ["Écran", '6.9" Super Retina XDR'],
      ["Puce", "A18 Pro"],
      ["Marque", "Apple"],
      ["Catégorie", "Smartphones"],
      ["Déclinaisons", "Burgundy · Glacier"],
      ["Disponibilité", "En stock"],
      ["Livraison", "Selon la ville"],
    ])
  })

  it("ne double pas une spécification déjà écrite par le Catalogue", () => {
    const specifications = specificationsAffichees(
      faits({
        specs: { Marque: "Apple Inc.", Catégorie: "Téléphonie" },
        freeShipping: true,
      })
    )

    expect(specifications).toContainEqual(["Marque", "Apple Inc."])
    expect(specifications).toContainEqual(["Catégorie", "Téléphonie"])
    expect(specifications).toContainEqual(["Livraison", "Offerte"])
    expect(specifications.filter(([label]) => label === "Marque")).toHaveLength(
      1
    )
  })

  it("annonce la rupture quand aucune Variante n'a de stock", () => {
    const specifications = specificationsAffichees(
      faits({ variants: [{ name: "Noir", stock: 0 }] })
    )

    expect(specifications).toContainEqual(["Disponibilité", "Rupture de stock"])
  })

  it("laisse de côté les faits vides", () => {
    const specifications = specificationsAffichees(
      faits({ categoryName: null, variants: [], brand: "" })
    )

    expect(specifications).toEqual([
      ["Disponibilité", "Rupture de stock"],
      ["Livraison", "Selon la ville"],
    ])
  })
})
