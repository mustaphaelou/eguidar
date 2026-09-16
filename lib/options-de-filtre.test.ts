import { describe, expect, it } from "vitest"

import {
  assemblerOptionsDeFiltre,
  type OptionsDeFiltre,
  type RepartitionsDeFacettes,
} from "@/lib/options-de-filtre"

/**
 * Les règles du panneau de la Recherche, valeur en entrée, valeur en
 * sortie : les décomptes traversent, marques et catégories sont triées par
 * libellé sous la locale `fr`, les Tranches de prix gardent l'ordre fixe de
 * leurs bandes, une valeur retenue est toujours émise même à zéro, un
 * libellé non résolu retombe sur sa valeur, et `selected` dit les filtres
 * actifs. Les options à zéro non retenues sortent du module : c'est la
 * barre latérale qui les masque.
 */

const AUCUNE: RepartitionsDeFacettes = {
  brands: {},
  categories: {},
  priceBuckets: {},
}

const AUCUN_NOM = new Map<string, string>()

/** Les cinq bandes, dans l'ordre fixe de `PRICE_BUCKETS`. */
const BANDES_ATTENDUES = [
  "0-1000",
  "1000-2500",
  "2500-5000",
  "5000-10000",
  "10000-plus",
]

describe("assemblerOptionsDeFiltre", () => {
  it("rend une option par valeur comptée, avec son décompte", () => {
    const options = assemblerOptionsDeFiltre(
      {
        brands: { Sony: 3 },
        categories: { audio: 2 },
        priceBuckets: { "2500-5000": 2 },
      },
      {},
      new Map([["audio", "Audio & Hi-Fi"]])
    )

    expect(options.brands).toEqual([
      { value: "Sony", label: "Sony", count: 3, selected: false },
    ])
    expect(options.categories).toEqual([
      { value: "audio", label: "Audio & Hi-Fi", count: 2, selected: false },
    ])
    expect(options.priceBuckets).toEqual([
      {
        value: "0-1000",
        label: "Moins de 1 000 MAD",
        count: 0,
        selected: false,
      },
      {
        value: "1000-2500",
        label: "1 000 – 2 500 MAD",
        count: 0,
        selected: false,
      },
      {
        value: "2500-5000",
        label: "2 500 – 5 000 MAD",
        count: 2,
        selected: false,
      },
      {
        value: "5000-10000",
        label: "5 000 – 10 000 MAD",
        count: 0,
        selected: false,
      },
      {
        value: "10000-plus",
        label: "Plus de 10 000 MAD",
        count: 0,
        selected: false,
      },
    ])
  })

  it("trie les marques par libellé sous la locale fr", () => {
    const options = assemblerOptionsDeFiltre(
      { ...AUCUNE, brands: { Zebra: 1, Électronique: 1, apple: 1 } },
      {},
      AUCUN_NOM
    )

    // Sous `fr`, « Électronique » se range avec les E — un tri par point de
    // code l'aurait placé après « Zebra ». La casse ne sépare pas « apple »
    // des autres.
    expect(options.brands.map((option) => option.value)).toEqual([
      "apple",
      "Électronique",
      "Zebra",
    ])
  })

  it("trie les catégories par leur nom résolu, pas par leur slug", () => {
    const options = assemblerOptionsDeFiltre(
      { ...AUCUNE, categories: { "z-slug": 1, "e-slug": 1 } },
      {},
      new Map([
        ["z-slug", "Éclairage"],
        ["e-slug", "Zoos"],
      ])
    )

    expect(options.categories.map((option) => option.label)).toEqual([
      "Éclairage",
      "Zoos",
    ])
  })

  it("garde l'ordre fixe des bandes, pas celui des décomptes", () => {
    const options = assemblerOptionsDeFiltre(
      {
        ...AUCUNE,
        // La répartition arrive dans le désordre et tait deux bandes.
        priceBuckets: { "10000-plus": 9, "0-1000": 1 },
      },
      {},
      AUCUN_NOM
    )

    expect(options.priceBuckets.map((option) => option.value)).toEqual(
      BANDES_ATTENDUES
    )
    expect(options.priceBuckets.map((option) => option.label)).toEqual([
      "Moins de 1 000 MAD",
      "1 000 – 2 500 MAD",
      "2 500 – 5 000 MAD",
      "5 000 – 10 000 MAD",
      "Plus de 10 000 MAD",
    ])
  })

  it("émet toutes les bandes de prix même sans aucune répartition", () => {
    const options = assemblerOptionsDeFiltre(AUCUNE, {}, AUCUN_NOM)

    expect(options.priceBuckets.map((option) => option.value)).toEqual(
      BANDES_ATTENDUES
    )
    expect(options.priceBuckets.every((option) => option.count === 0)).toBe(
      true
    )
  })

  it("émet une marque retenue absente de la répartition, à zéro", () => {
    const options = assemblerOptionsDeFiltre(
      { ...AUCUNE, brands: { Sony: 2 } },
      { brand: ["Sony", "Teufel"] },
      AUCUN_NOM
    )

    expect(options.brands).toEqual([
      { value: "Sony", label: "Sony", count: 2, selected: true },
      { value: "Teufel", label: "Teufel", count: 0, selected: true },
    ])
  })

  it("émet une catégorie retenue absente de la répartition, avec son nom", () => {
    const options = assemblerOptionsDeFiltre(
      { ...AUCUNE, categories: { audio: 1 } },
      { categorySlug: "video" },
      new Map([
        ["audio", "Audio & Hi-Fi"],
        ["video", "Vidéo"],
      ])
    )

    expect(options.categories).toEqual([
      { value: "audio", label: "Audio & Hi-Fi", count: 1, selected: false },
      { value: "video", label: "Vidéo", count: 0, selected: true },
    ])
  })

  it("émet une valeur non retenue à zéro, que la barre latérale masquera", () => {
    const options = assemblerOptionsDeFiltre(
      {
        brands: { Sony: 0 },
        categories: { audio: 0 },
        priceBuckets: {},
      },
      {},
      new Map([["audio", "Audio & Hi-Fi"]])
    )

    expect(options.brands).toEqual([
      { value: "Sony", label: "Sony", count: 0, selected: false },
    ])
    expect(options.categories).toEqual([
      { value: "audio", label: "Audio & Hi-Fi", count: 0, selected: false },
    ])
  })

  it("retombe sur la valeur quand aucun libellé n'est résolu", () => {
    const options = assemblerOptionsDeFiltre(
      { ...AUCUNE, categories: { "slug-inconnu": 1 } },
      {},
      AUCUN_NOM
    )

    expect(options.categories).toEqual([
      {
        value: "slug-inconnu",
        label: "slug-inconnu",
        count: 1,
        selected: false,
      },
    ])
  })

  it("marque selected selon les filtres actifs, pour les trois listes", () => {
    const options = assemblerOptionsDeFiltre(
      {
        brands: { Sony: 1, LG: 1 },
        categories: { audio: 1, video: 1 },
        priceBuckets: { "2500-5000": 1 },
      },
      {
        brand: ["LG"],
        categorySlug: "video",
        priceBucketId: "2500-5000",
      },
      new Map([
        ["audio", "Audio & Hi-Fi"],
        ["video", "Vidéo"],
      ])
    )

    expect(options.brands.map((option) => option.selected)).toEqual([
      true,
      false,
    ])
    expect(options.categories.map((option) => option.selected)).toEqual([
      false,
      true,
    ])
    expect(
      options.priceBuckets
        .filter((option) => option.selected)
        .map((option) => option.value)
    ).toEqual(["2500-5000"])
    expect(
      options.priceBuckets.filter((option) => option.selected)
    ).toHaveLength(1)
  })

  it("ignore une valeur hors de l'univers des bandes", () => {
    const options = assemblerOptionsDeFiltre(
      { ...AUCUNE, priceBuckets: { "bande-obsolete": 4 } },
      {},
      AUCUN_NOM
    )

    expect(options.priceBuckets.map((option) => option.value)).toEqual(
      BANDES_ATTENDUES
    )
  })

  it("ne mute ni les répartitions ni les filtres reçus", () => {
    const repartitions: RepartitionsDeFacettes = {
      brands: { Sony: 1 },
      categories: { audio: 1 },
      priceBuckets: {},
    }
    const filtres = { brand: ["Teufel"], categorySlug: "video" }

    const options: OptionsDeFiltre = assemblerOptionsDeFiltre(
      repartitions,
      filtres,
      AUCUN_NOM
    )

    expect(options.brands).toHaveLength(2)
    expect(repartitions).toEqual({
      brands: { Sony: 1 },
      categories: { audio: 1 },
      priceBuckets: {},
    })
    expect(filtres).toEqual({ brand: ["Teufel"], categorySlug: "video" })
  })
})
