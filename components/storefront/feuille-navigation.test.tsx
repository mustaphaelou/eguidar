import { describe, expect, it } from "vitest"

import { SEARCH_SORT_DEFAULT, SEARCH_SORT_OPTIONS } from "@/lib/search-params"

import { colonnesDeLaFeuille, hrefMarqueCategorie } from "./feuille-navigation"

describe("colonnesDeLaFeuille", () => {
  const libellesTrisAttendus = [
    ...SEARCH_SORT_OPTIONS.filter(
      (option) => option.id !== SEARCH_SORT_DEFAULT
    ).map((option) => option.label),
    "Tout le catalogue",
  ]

  it("produit trois colonnes quand sous-catégories et marques coexistent", () => {
    const colonnes = colonnesDeLaFeuille({
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
        href: hrefMarqueCategorie("smartphones", "Apple"),
      },
      {
        label: "Samsung",
        href: hrefMarqueCategorie("smartphones", "Samsung"),
      },
    ])
    expect(colonnes[2]?.liens.map((lien) => lien.label)).toEqual(
      libellesTrisAttendus
    )
  })

  it("efface la colonne des marques quand aucune marque n'existe", () => {
    const colonnes = colonnesDeLaFeuille({
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
    const colonnes = colonnesDeLaFeuille({
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
        href: hrefMarqueCategorie("accessoires", "Anker"),
      },
      {
        label: "Logitech",
        href: hrefMarqueCategorie("accessoires", "Logitech"),
      },
    ])
  })

  it("reste propre avec deux colonnes quand la catégorie est vide de sous-catégories et de marques", () => {
    const colonnes = colonnesDeLaFeuille({
      name: "Gaming",
      slug: "gaming",
      children: [],
      brands: [],
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
