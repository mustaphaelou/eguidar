import { describe, expect, it } from "vitest"

import { galerieImageProduitSchema } from "@/lib/galerie-image-produit"

const BASE_CDN = "https://cdn.eguidar.com"

function galerieValide(base: string | null, url: string) {
  return galerieImageProduitSchema(base).safeParse([{ kind: "persistee", url }])
}

describe("le schéma de la Galerie produit", () => {
  it("accepte une Image produit promue sous le CDN de la boutique, sans la réécrire", () => {
    const galerie = [
      {
        kind: "persistee" as const,
        url: `${BASE_CDN}/products/image-promue.webp`,
      },
    ]

    expect(galerieImageProduitSchema(BASE_CDN).parse(galerie)).toEqual(galerie)
  })

  it("tolère la barre finale de la base publique", () => {
    expect(
      galerieImageProduitSchema(`${BASE_CDN}/`).safeParse([
        { kind: "persistee", url: `${BASE_CDN}/products/image-1.webp` },
      ]).success
    ).toBe(true)
  })

  it("refuse un hôte arbitraire", () => {
    expect(
      galerieValide(BASE_CDN, "https://ailleurs.example.test/products/x.webp")
        .success
    ).toBe(false)
  })

  it("refuse une URL du CDN hors de l'espace des Images produit", () => {
    expect(
      galerieValide(BASE_CDN, `${BASE_CDN}/categories/image-1.webp`).success
    ).toBe(false)
  })

  it("refuse une URL de Brouillon d'Image produit comme Image persistée", () => {
    expect(
      galerieValide(BASE_CDN, `${BASE_CDN}/products/brouillons/brouillon.webp`)
        .success
    ).toBe(false)
  })

  it("refuse toute Image persistée quand la base du CDN est absente", () => {
    expect(
      galerieValide(null, `${BASE_CDN}/products/image-1.webp`).success
    ).toBe(false)
  })

  it("laisse passer un Brouillon d'Image produit, quel que soit l'hôte de son aperçu", () => {
    const galerie = [
      {
        kind: "brouillon" as const,
        draftId: "brouillon-1",
        previewUrl: "https://ailleurs.example.test/apercu.webp",
      },
    ]

    expect(galerieImageProduitSchema(BASE_CDN).parse(galerie)).toEqual(galerie)
  })

  it("accepte une galerie vide", () => {
    expect(galerieImageProduitSchema(BASE_CDN).parse([])).toEqual([])
  })
})
