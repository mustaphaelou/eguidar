import { describe, expect, it } from "vitest"

import { colonnesDuPanneau } from "./panneau-navigation"

describe("colonnesDuPanneau", () => {
  it("produit trois colonnes quand sous-catégories et marques coexistent", () => {
    const colonnes = colonnesDuPanneau({
      name: "Smartphones",
      slug: "smartphones",
      children: [
        { name: "iPhone", slug: "iphone" },
        { name: "Galaxy", slug: "galaxy" },
      ],
      brands: ["Apple", "Samsung"],
    })

    expect(colonnes.map((colonne) => colonne.id)).toEqual([
      "explorer",
      "marques",
      "decouvrir",
    ])
    expect(colonnes[0]).toEqual({
      id: "explorer",
      titre: "Explorer Smartphones",
      principal: true,
      liens: [
        { label: "Tout Smartphones", href: "/categorie/smartphones" },
        { label: "iPhone", href: "/categorie/iphone" },
        { label: "Galaxy", href: "/categorie/galaxy" },
      ],
    })
    expect(colonnes[1]?.liens).toEqual([
      {
        label: "Apple",
        href: "/produits?marque=Apple&categorie=smartphones",
      },
      {
        label: "Samsung",
        href: "/produits?marque=Samsung&categorie=smartphones",
      },
    ])
    expect(colonnes[2]?.liens.map((lien) => lien.label)).toEqual([
      "Nouveautés",
      "Prix croissant",
      "Prix décroissant",
      "Tout le catalogue",
    ])
  })

  it("efface la colonne des marques quand aucune marque n'existe", () => {
    const colonnes = colonnesDuPanneau({
      name: "Audio",
      slug: "audio",
      children: [{ name: "Casques", slug: "casques" }],
      brands: [],
    })

    expect(colonnes.map((colonne) => colonne.id)).toEqual([
      "explorer",
      "decouvrir",
    ])
  })

  it("élève les marques en colonne principale lorsqu'il n'y a pas de sous-catégorie", () => {
    const colonnes = colonnesDuPanneau({
      name: "Accessoires",
      slug: "accessoires",
      children: [],
      brands: ["Anker", "Logitech"],
    })

    expect(colonnes.map((colonne) => colonne.id)).toEqual([
      "explorer",
      "decouvrir",
    ])
    expect(colonnes[0]?.liens).toEqual([
      { label: "Tout Accessoires", href: "/categorie/accessoires" },
      {
        label: "Anker",
        href: "/produits?marque=Anker&categorie=accessoires",
      },
      {
        label: "Logitech",
        href: "/produits?marque=Logitech&categorie=accessoires",
      },
    ])
  })

  it("reste propre avec deux colonnes quand la catégorie est vide de sous-catégories et de marques", () => {
    const colonnes = colonnesDuPanneau({
      name: "Gaming",
      slug: "gaming",
    })

    expect(colonnes.map((colonne) => colonne.id)).toEqual([
      "explorer",
      "decouvrir",
    ])
    expect(colonnes[0]?.liens).toEqual([
      { label: "Tout Gaming", href: "/categorie/gaming" },
    ])
  })
})
