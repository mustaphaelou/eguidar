import { describe, expect, it } from "vitest"

import {
  construireDigestProprietaire,
  construireDigestStockBas,
  construireReconciliation,
} from "@/lib/automations/digests"
import type { IndexableProduct } from "@/lib/index-projection"

function document(
  id: string,
  name: string,
  updatedAt: number
): IndexableProduct {
  return {
    id,
    name,
    slug: id,
    description: "",
    brand: "Marque",
    price: 1000,
    minPrice: 1000,
    totalStock: 1,
    images: [],
    categorySlug: "categorie",
    categoryName: "Catégorie",
    specsText: "",
    variantNames: [],
    skus: [],
    isFeatured: false,
    freeShipping: false,
    priceBucket: "0-1000",
    updatedAt,
  }
}

describe("le digest du stock bas", () => {
  const lignes = [
    { produit: "Zèbre", variante: "Standard", sku: "Z-1", stock: 0 },
    { produit: "Écran", variante: "Standard", sku: "E-1", stock: 2 },
    { produit: "Écran", variante: "Premium", sku: "E-2", stock: 1 },
  ]

  it("trie les lignes en français, indépendamment de l'ordre de lecture", () => {
    const attendu = construireDigestStockBas({
      jour: "2026-10-28",
      seuil: 5,
      lignes,
    })

    expect(
      construireDigestStockBas({
        jour: "2026-10-28",
        seuil: 5,
        lignes: [...lignes].reverse(),
      })
    ).toBe(attendu)

    expect(attendu).toBe(
      [
        "Stock bas du 2026-10-28 (seuil 5) : 3 variante(s).",
        "- « Écran » — Premium (E-2) : 1 restant",
        "- « Écran » — Standard (E-1) : 2 restants",
        "- « Zèbre » — Standard (Z-1) : 0 restant",
      ].join("\n")
    )
  })

  it("dit qu'il n'y a rien plutôt que d'envoyer une liste vide", () => {
    expect(
      construireDigestStockBas({ jour: "2026-10-28", seuil: 5, lignes: [] })
    ).toBe("Stock bas du 2026-10-28 (seuil 5) : aucune variante.")
  })
})

describe("le digest du propriétaire", () => {
  it("est une projection stable", () => {
    const faits = {
      jour: "2026-10-28",
      produitCount: 12,
      commandeEnAttente: 3,
      caEncaisse30j: 125000,
      stockBas: 2,
    }
    expect(construireDigestProprietaire(faits)).toBe(
      construireDigestProprietaire({ ...faits })
    )
    expect(construireDigestProprietaire(faits)).toContain(
      "Tableau de bord du 2026-10-28"
    )
    expect(construireDigestProprietaire(faits)).toContain("Produits : 12")
  })
})

describe("la réconciliation de la recherche", () => {
  it("écrit les documents absents ou périmés et retire les orphelins", () => {
    const rapport = construireReconciliation({
      jour: "2026-10-28",
      produits: [
        document("c", "C", 300),
        document("a", "A", 100),
        document("b", "B", 200),
      ],
      documents: [
        document("a", "A", 99),
        document("b", "B", 200),
        document("z", "Z", 1),
      ],
    })

    expect(rapport.aReecrire.map((produit) => produit.id)).toEqual(["a", "c"])
    expect(rapport.aRetirer).toEqual(["z"])
    expect(rapport.texte).toContain(
      "Réconciliation du 2026-10-28 : 2 à réécrire, 1 à retirer."
    )
    expect(rapport.texte.indexOf("a (A)")).toBeLessThan(
      rapport.texte.indexOf("c (C)")
    )
  })

  it("ne trouve plus rien quand l'index est à jour", () => {
    const produits = [document("a", "A", 100)]
    const rapport = construireReconciliation({
      jour: "2026-10-28",
      produits,
      documents: produits,
    })
    expect(rapport.aReecrire).toEqual([])
    expect(rapport.aRetirer).toEqual([])
    expect(rapport.texte).toBe(
      "Réconciliation du 2026-10-28 : 0 à réécrire, 0 à retirer."
    )
  })
})
