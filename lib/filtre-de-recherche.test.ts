import { describe, expect, it } from "vitest"

import {
  etatDesFiltres,
  lireFiltres,
  parametresDeFiltre,
  type CleDeFiltre,
  type OptionDeFiltre,
  type RepartitionsDeFacettes,
} from "@/lib/filtre-de-recherche"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"

const REPARTITIONS_VIDES: RepartitionsDeFacettes = {
  marque: {},
  categorie: {},
  prix: {},
}

const NOMS_DE_CATEGORIES = new Map([
  ["audio", "Audio & Hi-Fi"],
  ["video", "Vidéo"],
  ["z-slug", "Éclairage"],
  ["e-slug", "Zoos"],
])

function tranchesAttendues(
  comptes: Readonly<Record<string, number>> = {},
  retenue?: string
): OptionDeFiltre[] {
  return PRICE_BUCKETS.map(({ id, label }) => ({
    value: id,
    label,
    count: comptes[id] ?? 0,
    selected: id === retenue,
  }))
}

function paramsDepuis(
  paires: readonly (readonly [CleDeFiltre, string])[]
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}
  for (const [cle, valeur] of paires) {
    const existantes = params[cle]
    params[cle] =
      existantes === undefined
        ? valeur
        : [...(Array.isArray(existantes) ? existantes : [existantes]), valeur]
  }
  return params
}

describe("lireFiltres", () => {
  it("relit ce que parametresDeFiltre a écrit", () => {
    const filtres: SearchFilters = {
      brand: ["Sony", "LG"],
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    }

    const parametres = parametresDeFiltre(filtres)

    expect(parametres).toEqual([
      ["marque", "Sony"],
      ["marque", "LG"],
      ["categorie", "audio-hifi"],
      ["prix", "2500-5000"],
    ])
    expect(lireFiltres(paramsDepuis(parametres))).toEqual(filtres)
  })

  it("lit une marque unique héritée comme une liste d'un élément", () => {
    expect(lireFiltres({ marque: "Sony" })).toEqual({ brand: ["Sony"] })
  })

  it("rogne les marques, écarte les vides et déduplique dans l'ordre d'apparition", () => {
    expect(
      lireFiltres({ marque: [" Sony ", "", "   ", "LG", "Sony", "LG "] })
    ).toEqual({ brand: ["Sony", "LG"] })
  })

  it("retient la première valeur d'une clé unique répétée, la rogne et écarte le vide", () => {
    expect(
      lireFiltres({
        categorie: [" audio-hifi ", "enceintes"],
        prix: [" 2500-5000 ", "0-1000"],
      })
    ).toEqual({
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
    expect(lireFiltres({ categorie: "   ", prix: "  " })).toEqual({})
  })

  it("ignore une tranche de prix inconnue", () => {
    expect(lireFiltres({ marque: "Sony", prix: "tranche-imaginaire" })).toEqual(
      { brand: ["Sony"] }
    )
  })
})

describe("etatDesFiltres", () => {
  it("rend une option par valeur comptée, libellée, et zéro pour une valeur absente", () => {
    const { options } = etatDesFiltres(
      {
        marque: { Sony: 2, LG: 1 },
        categorie: { audio: 3 },
        prix: { "0-1000": 2 },
      },
      {},
      NOMS_DE_CATEGORIES
    )

    expect(options.marque).toEqual([
      { value: "LG", label: "LG", count: 1, selected: false },
      { value: "Sony", label: "Sony", count: 2, selected: false },
    ])
    expect(options.categorie).toEqual([
      { value: "audio", label: "Audio & Hi-Fi", count: 3, selected: false },
    ])
    expect(options.prix).toEqual(tranchesAttendues({ "0-1000": 2 }))
  })

  it("rend les puces dans l'ordre des marques retenues, puis la catégorie, puis la Tranche", () => {
    const { filtresActifs } = etatDesFiltres(
      {
        marque: { Sony: 1, Apple: 1 },
        categorie: { audio: 1 },
        prix: { "2500-5000": 1 },
      },
      {
        brand: ["Sony", "Apple"],
        categorySlug: "audio",
        priceBucketId: "2500-5000",
      },
      NOMS_DE_CATEGORIES
    )

    expect(filtresActifs).toEqual([
      {
        cle: "marque",
        valeur: "Sony",
        label: "Sony",
        ariaLabel: "Retirer la marque Sony",
      },
      {
        cle: "marque",
        valeur: "Apple",
        label: "Apple",
        ariaLabel: "Retirer la marque Apple",
      },
      {
        cle: "categorie",
        valeur: "audio",
        label: "Audio & Hi-Fi",
        ariaLabel: "Retirer la catégorie Audio & Hi-Fi",
      },
      {
        cle: "prix",
        valeur: "2500-5000",
        label: "2 500 – 5 000 MAD",
        ariaLabel: "Retirer la tranche de prix 2 500 – 5 000 MAD",
      },
    ])
  })

  it("retombe sur le slug quand la Structure ne nomme pas la catégorie", () => {
    const { options } = etatDesFiltres(
      { marque: {}, categorie: { "slug-inconnu": 1 }, prix: {} },
      {},
      new Map()
    )

    expect(options.categorie).toEqual([
      {
        value: "slug-inconnu",
        label: "slug-inconnu",
        count: 1,
        selected: false,
      },
    ])
  })

  it("émet les valeurs retenues absentes de la répartition, une seule fois, à zéro et sélectionnées", () => {
    const { options } = etatDesFiltres(
      { marque: { Sony: 1 }, categorie: { audio: 2 }, prix: {} },
      { brand: ["Sony", "Teufel", "Teufel"], categorySlug: "video" },
      NOMS_DE_CATEGORIES
    )

    expect(options.marque).toEqual([
      { value: "Sony", label: "Sony", count: 1, selected: true },
      { value: "Teufel", label: "Teufel", count: 0, selected: true },
    ])
    expect(options.categorie).toEqual([
      { value: "audio", label: "Audio & Hi-Fi", count: 2, selected: false },
      { value: "video", label: "Vidéo", count: 0, selected: true },
    ])
  })

  it("trie les marques et les catégories par libellé sous la locale fr", () => {
    const { options } = etatDesFiltres(
      {
        marque: { Zebra: 1, apple: 1, Électronique: 1 },
        categorie: { "z-slug": 1, "e-slug": 1 },
        prix: {},
      },
      {},
      NOMS_DE_CATEGORIES
    )

    expect(options.marque.map(({ value }) => value)).toEqual([
      "apple",
      "Électronique",
      "Zebra",
    ])
    expect(options.categorie.map(({ value }) => value)).toEqual([
      "z-slug",
      "e-slug",
    ])
    expect(options.categorie.map(({ label }) => label)).toEqual([
      "Éclairage",
      "Zoos",
    ])
  })

  it("garde l'ordre fixe des cinq bandes, décompte nul compris", () => {
    const { options } = etatDesFiltres(
      { marque: {}, categorie: {}, prix: { "10000-plus": 3, "0-1000": 1 } },
      {},
      new Map()
    )

    expect(options.prix.map(({ value }) => value)).toEqual(
      PRICE_BUCKETS.map(({ id }) => id)
    )
    expect(options.prix).toEqual(
      tranchesAttendues({ "0-1000": 1, "10000-plus": 3 })
    )
  })

  it("ignore une valeur de répartition hors des cinq bandes", () => {
    const { options } = etatDesFiltres(
      { marque: {}, categorie: {}, prix: { "bande-obsolete": 4 } },
      {},
      new Map()
    )

    expect(options.prix).toEqual(tranchesAttendues())
  })

  it("émet une Tranche retenue hors des bandes après les cinq, à zéro, avec son identifiant", () => {
    const { options, filtresActifs } = etatDesFiltres(
      { marque: {}, categorie: {}, prix: { "0-1000": 4 } },
      { priceBucketId: "bande-obsolete" },
      new Map()
    )

    expect(options.prix).toHaveLength(PRICE_BUCKETS.length + 1)
    expect(options.prix.at(-1)).toEqual({
      value: "bande-obsolete",
      label: "bande-obsolete",
      count: 0,
      selected: true,
    })
    expect(filtresActifs).toEqual([
      {
        cle: "prix",
        valeur: "bande-obsolete",
        label: "bande-obsolete",
        ariaLabel: "Retirer la tranche de prix bande-obsolete",
      },
    ])
  })

  it("marque selected par clé : marque retenue, slug de catégorie égal, identifiant de Tranche égal", () => {
    const { options } = etatDesFiltres(
      {
        marque: { Sony: 1, LG: 1 },
        categorie: { audio: 1, video: 1 },
        prix: { "0-1000": 1, "2500-5000": 1 },
      },
      { brand: ["Sony"], categorySlug: "video", priceBucketId: "2500-5000" },
      NOMS_DE_CATEGORIES
    )

    expect(
      options.marque.map(({ value, selected }) => [value, selected])
    ).toEqual([
      ["LG", false],
      ["Sony", true],
    ])
    expect(
      options.categorie.map(({ value, selected }) => [value, selected])
    ).toEqual([
      ["audio", false],
      ["video", true],
    ])
    expect(
      options.prix.filter(({ selected }) => selected).map(({ value }) => value)
    ).toEqual(["2500-5000"])
  })

  it("nomme la puce avec le libellé de son option", () => {
    const { options, filtresActifs } = etatDesFiltres(
      { marque: {}, categorie: { audio: 0 }, prix: {} },
      { categorySlug: "audio" },
      NOMS_DE_CATEGORIES
    )

    const option = options.categorie.find(({ value }) => value === "audio")
    expect(filtresActifs[0].label).toBe(option?.label)
    expect(filtresActifs[0].label).toBe("Audio & Hi-Fi")
  })

  it("répond les listes vides et les cinq bandes à zéro quand rien n'est réparti", () => {
    const { options, filtresActifs } = etatDesFiltres(
      REPARTITIONS_VIDES,
      {},
      new Map()
    )

    expect(options).toEqual({
      marque: [],
      categorie: [],
      prix: tranchesAttendues(),
    })
    expect(filtresActifs).toEqual([])
  })

  it("rend les Filtres retenus à zéro sur la voie vide, libellés de leurs valeurs brutes", () => {
    const { options, filtresActifs } = etatDesFiltres(
      REPARTITIONS_VIDES,
      {
        brand: ["Sony"],
        categorySlug: "audio-hifi",
        priceBucketId: "1000-2500",
      },
      new Map()
    )

    expect(options.marque).toEqual([
      { value: "Sony", label: "Sony", count: 0, selected: true },
    ])
    expect(options.categorie).toEqual([
      { value: "audio-hifi", label: "audio-hifi", count: 0, selected: true },
    ])
    expect(options.prix.filter(({ selected }) => selected)).toEqual([
      {
        value: "1000-2500",
        label: "1 000 – 2 500 MAD",
        count: 0,
        selected: true,
      },
    ])
    expect(filtresActifs).toEqual([
      {
        cle: "marque",
        valeur: "Sony",
        label: "Sony",
        ariaLabel: "Retirer la marque Sony",
      },
      {
        cle: "categorie",
        valeur: "audio-hifi",
        label: "audio-hifi",
        ariaLabel: "Retirer la catégorie audio-hifi",
      },
      {
        cle: "prix",
        valeur: "1000-2500",
        label: "1 000 – 2 500 MAD",
        ariaLabel: "Retirer la tranche de prix 1 000 – 2 500 MAD",
      },
    ])
  })
})
