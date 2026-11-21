import { describe, expect, it } from "vitest"

import {
  descriptionAffichee,
  specificationsAffichees,
  type FaitsDeFicheProduit,
} from "@/lib/fiche-produit"
import { formatPrice } from "@/lib/money"

function faits(
  overrides: Partial<FaitsDeFicheProduit> = {}
): FaitsDeFicheProduit {
  return {
    name: "iPhone 18 Pro Max",
    brand: "Apple",
    description: "",
    specs: {},
    categoryName: "Smartphones",
    variants: [
      { name: "Burgundy", prix: 3688790, stock: 0 },
      { name: "Glacier", prix: 3688790, stock: 1 },
    ],
    minPrice: 3688790,
    freeShipping: false,
    ...overrides,
  }
}

describe("descriptionAffichee", () => {
  it("garde la description écrite par le Catalogue", () => {
    expect(
      descriptionAffichee(faits({ description: "  Une fiche déjà rédigée.  " }))
    ).toBe("Une fiche déjà rédigée.")
  })

  it("compose une description lisible quand le Catalogue n'en a pas", () => {
    const description = descriptionAffichee(faits())

    expect(description).toContain("iPhone 18 Pro Max (Apple)")
    expect(description).toContain("notre rayon Smartphones")
    expect(description).toContain("2 déclinaisons : Burgundy et Glacier")
    expect(description).toContain(
      `Son prix commence à ${formatPrice(3688790)}, TVA 20 % incluse.`
    )
    expect(description).toContain("disponible dès maintenant")
    expect(description).toContain("frais de livraison selon la ville")
  })

  it("ne répète pas la marque quand le nom la porte déjà", () => {
    const description = descriptionAffichee(
      faits({ name: "Samsung Galaxy S24 Ultra", brand: "Samsung" })
    )

    expect(description).toContain("Samsung Galaxy S24 Ultra est un produit")
    expect(description).not.toContain("(Samsung)")
  })

  it("annonce la rupture quand aucune Variante n'a de stock", () => {
    const description = descriptionAffichee(
      faits({
        variants: [{ name: "Noir", prix: 3688790, stock: 0 }],
        freeShipping: true,
      })
    )

    expect(description).toContain("un seul modèle")
    expect(description).toContain("actuellement en rupture de stock")
    expect(description).toContain("La livraison est offerte")
  })

  it("n'invente pas de rayon sans Catégorie", () => {
    expect(descriptionAffichee(faits({ categoryName: null }))).toContain(
      "de notre catalogue"
    )
  })
})

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
      faits({
        variants: [{ name: "Noir", prix: 3688790, stock: 0 }],
      })
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
