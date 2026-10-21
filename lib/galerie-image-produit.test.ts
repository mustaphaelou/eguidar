import { describe, expect, it } from "vitest"

import {
  galerieImageProduitSchema,
  identifiantsBrouillonsGalerie,
} from "@/lib/galerie-image-produit"

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

function brouillon(draftId: string) {
  return {
    kind: "brouillon" as const,
    draftId,
    previewUrl: `${BASE_CDN}/products/brouillons/${draftId}.webp`,
  }
}

function persistee(url: string) {
  return { kind: "persistee" as const, url }
}

describe("les identifiants de Brouillon d'une Galerie produit", () => {
  it("extrait les Brouillons intercalés entre des Images persistées, dans l'ordre de la Galerie", () => {
    const galerie = [
      persistee(`${BASE_CDN}/products/image-1.webp`),
      brouillon("brouillon-1"),
      persistee(`${BASE_CDN}/products/image-2.webp`),
      brouillon("brouillon-2"),
    ]

    expect(identifiantsBrouillonsGalerie(galerie)).toEqual([
      "brouillon-1",
      "brouillon-2",
    ])
  })

  it("ne rend chaque identifiant qu'une fois, à sa première apparition", () => {
    const galerie = [
      brouillon("brouillon-2"),
      brouillon("brouillon-1"),
      brouillon("brouillon-2"),
      brouillon("brouillon-1"),
    ]

    expect(identifiantsBrouillonsGalerie(galerie)).toEqual([
      "brouillon-2",
      "brouillon-1",
    ])
  })

  it("ne rend aucun identifiant pour une Galerie entièrement persistée", () => {
    const galerie = [
      persistee(`${BASE_CDN}/products/image-1.webp`),
      persistee(`${BASE_CDN}/products/image-2.webp`),
    ]

    expect(identifiantsBrouillonsGalerie(galerie)).toEqual([])
  })
})
