import { describe, expect, it } from "vitest"

import {
  calloutDuProduit,
  decompteDesProduits,
  parPaires,
  projeterPanneau,
  projeterPanneaux,
} from "@/lib/accueil-panneaux"
import { type CarteProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"

function makeProduit(overrides: Partial<CarteProduit> = {}): CarteProduit {
  return {
    id: "p-1",
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    brand: "Apple",
    image: null,
    minPrice: 1249900,
    totalStock: 24,
    freeShipping: false,
    ...overrides,
  }
}

describe("calloutDuProduit", () => {
  it("annonce le prix le plus bas, précédé de « Dès »", () => {
    expect(calloutDuProduit(makeProduit())).toBe(`Dès ${formatPrice(1249900)}`)
  })

  it("ajoute la livraison offerte quand le Produit la porte", () => {
    expect(calloutDuProduit(makeProduit({ freeShipping: true }))).toBe(
      `Dès ${formatPrice(1249900)} · Livraison offerte`
    )
  })

  it("ne dit rien d'autre quand elle ne la porte pas", () => {
    expect(
      calloutDuProduit(makeProduit({ freeShipping: false }))
    ).not.toContain("Livraison offerte")
  })
})

describe("projeterPanneau", () => {
  it("sert la copie écrite pour le slug, et le titre du Produit", () => {
    const panneau = projeterPanneau(makeProduit())

    expect(panneau.titre).toBe("iPhone 15 Pro")
    expect(panneau.surtitre).toBe("Le titane, la puce A17 Pro, et un zoom ×5.")
    expect(panneau.href).toBe("/produit/iphone-15-pro")
    expect(panneau.callout).toBe(`Dès ${formatPrice(1249900)}`)
  })

  it("replie sur la marque quand le slug n'a pas de copie écrite", () => {
    const panneau = projeterPanneau(
      makeProduit({
        name: "PlayStation 5 Slim",
        slug: "playstation-5-slim",
        brand: "Sony",
      })
    )

    expect(panneau.titre).toBe("PlayStation 5 Slim")
    expect(panneau.surtitre).toBe("Sony")
    expect(panneau.callout).toBe(`Dès ${formatPrice(1249900)}`)
  })

  it("ne dépend pas de la marque pour choisir la copie", () => {
    const panneau = projeterPanneau(
      makeProduit({
        slug: "macbook-air-13-m3",
        brand: "Apple",
        name: "MacBook Air 13 M3",
      })
    )

    expect(panneau.surtitre).toBe("Une journée d'autonomie, dans 1,24 kg.")
  })

  it("rend le Produit tel quel, image comprise", () => {
    const produit = makeProduit({
      image: "https://cdn.eguidar.com/products/a.jpg",
    })

    expect(projeterPanneau(produit).produit).toBe(produit)
  })
})

describe("projeterPanneaux", () => {
  it("garde l'ordre reçu — celui de featuredOrder", () => {
    const panneaux = projeterPanneaux([
      makeProduit({ id: "p-1", slug: "premier" }),
      makeProduit({ id: "p-2", slug: "second" }),
      makeProduit({ id: "p-3", slug: "troisieme" }),
    ])

    expect(panneaux.map((panneau) => panneau.produit.slug)).toEqual([
      "premier",
      "second",
      "troisieme",
    ])
  })

  it("ne rend rien pour un catalogue sans mise en avant", () => {
    expect(projeterPanneaux([])).toEqual([])
  })
})

describe("decompteDesProduits", () => {
  it("accorde le décompte d'une Structure", () => {
    expect(
      decompteDesProduits({
        id: "c-1",
        name: "Smartphones",
        slug: "smartphones",
        image: null,
        productCount: 1,
        children: [],
      })
    ).toBe("1 produit")

    expect(
      decompteDesProduits({
        id: "c-2",
        name: "Gaming",
        slug: "gaming",
        image: null,
        productCount: 4,
        children: [],
      })
    ).toBe("4 produits")
  })
})

describe("parPaires", () => {
  it("range une liste en rangées de deux", () => {
    expect(parPaires([1, 2, 3, 4])).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it("laisse la dernière rangée courte plutôt que de la remplir", () => {
    expect(parPaires([1, 2, 3])).toEqual([[1, 2], [3]])
  })

  it("ne rend aucune rangée pour une liste vide", () => {
    expect(parPaires([])).toEqual([])
  })
})
