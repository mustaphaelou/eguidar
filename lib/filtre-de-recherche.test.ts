import { describe, expect, it } from "vitest"

import {
  choisirValeur,
  CLES_DE_FILTRE,
  etatDesFiltres,
  lireFiltres,
  nombreDeFiltres,
  optionsVisibles,
  parametresDeFiltre,
  retirerFacette,
  retirerValeur,
  valeursRetenues,
  type CleDeFiltre,
  type OptionDeFiltre,
  type RepartitionsDeFacettes,
} from "@/lib/filtre-de-recherche"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"
import { tranchesAttendues } from "@/test/recherche-fixtures"

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

describe("la table des clés", () => {
  it("sert chaque clé qu'elle déclare par toutes les opérations", () => {
    for (const cle of CLES_DE_FILTRE) {
      const choisis = choisirValeur({}, cle, "valeur")

      expect(parametresDeFiltre(choisis)).toEqual([[cle, "valeur"]])
      expect(valeursRetenues(choisis, cle)).toEqual(["valeur"])
      expect(nombreDeFiltres(choisis)).toBe(1)
      expect(valeursRetenues(retirerFacette(choisis, cle), cle)).toEqual([])
      expect(
        valeursRetenues(retirerValeur(choisis, cle, "valeur"), cle)
      ).toEqual([])
    }
  })
})

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

describe("choisirValeur", () => {
  const filtres: SearchFilters = {
    brand: ["Sony"],
    categorySlug: "audio",
    priceBucketId: "0-1000",
  }

  it("ajoute une marque à la suite des marques retenues", () => {
    expect(choisirValeur(filtres, "marque", "LG")).toEqual({
      brand: ["Sony", "LG"],
      categorySlug: "audio",
      priceBucketId: "0-1000",
    })
  })

  it("n'ajoute pas une marque déjà retenue et rend une nouvelle valeur", () => {
    const choisis = choisirValeur(filtres, "marque", "Sony")

    expect(choisis).toEqual(filtres)
    expect(choisis).not.toBe(filtres)
  })

  it("remplace la catégorie retenue", () => {
    expect(choisirValeur(filtres, "categorie", "video")).toEqual({
      brand: ["Sony"],
      categorySlug: "video",
      priceBucketId: "0-1000",
    })
  })

  it("remplace la Tranche de prix retenue", () => {
    expect(choisirValeur(filtres, "prix", "2500-5000")).toEqual({
      brand: ["Sony"],
      categorySlug: "audio",
      priceBucketId: "2500-5000",
    })
  })

  it("choisit sur des filtres vides sans muter son argument", () => {
    const vides: SearchFilters = {}

    const choisis = choisirValeur(vides, "marque", "Sony")

    expect(choisis).toEqual({ brand: ["Sony"] })
    expect(choisis).not.toBe(vides)
    expect(vides).toEqual({})
  })

  it("ne mute jamais son argument", () => {
    choisirValeur(filtres, "marque", "LG")
    choisirValeur(filtres, "categorie", "video")
    choisirValeur(filtres, "prix", "2500-5000")

    expect(filtres).toEqual({
      brand: ["Sony"],
      categorySlug: "audio",
      priceBucketId: "0-1000",
    })
  })
})

describe("valeursRetenues", () => {
  it("rend les marques retenues dans leur ordre d'apparition", () => {
    expect(valeursRetenues({ brand: ["LG", "Sony"] }, "marque")).toEqual([
      "LG",
      "Sony",
    ])
  })

  it("rend zéro ou une valeur pour les clés uniques", () => {
    expect(valeursRetenues({ categorySlug: "audio" }, "categorie")).toEqual([
      "audio",
    ])
    expect(valeursRetenues({ priceBucketId: "0-1000" }, "prix")).toEqual([
      "0-1000",
    ])
    expect(valeursRetenues({}, "categorie")).toEqual([])
    expect(valeursRetenues({}, "prix")).toEqual([])
  })

  it("rend un tableau de marques neuf, détaché des filtres", () => {
    const filtres: SearchFilters = { brand: ["Sony", "LG"] }

    const retenues = valeursRetenues(filtres, "marque")

    expect(retenues).toEqual(["Sony", "LG"])
    expect(retenues).not.toBe(filtres.brand)
    expect(valeursRetenues({}, "marque")).toEqual([])
  })

  it("traite un champ unique vide comme absent : ni compte, ni puce, ni option sélectionnée", () => {
    const filtres: SearchFilters = { categorySlug: "", priceBucketId: "" }

    expect(valeursRetenues(filtres, "categorie")).toEqual([])
    expect(valeursRetenues(filtres, "prix")).toEqual([])
    expect(nombreDeFiltres(filtres)).toBe(0)

    const { options, filtresActifs } = etatDesFiltres(
      REPARTITIONS_VIDES,
      filtres,
      new Map()
    )

    expect(filtresActifs).toEqual([])
    expect(options.categorie).toEqual([])
    expect(options.prix.filter((option) => option.selected)).toEqual([])
  })
})

describe("nombreDeFiltres", () => {
  it("compte chaque marque individuellement et une par clé unique", () => {
    expect(
      nombreDeFiltres({
        brand: ["Sony", "LG"],
        categorySlug: "audio",
        priceBucketId: "0-1000",
      })
    ).toBe(4)
  })

  it("compte zéro quand aucun filtre n'est retenu", () => {
    expect(nombreDeFiltres({})).toBe(0)
  })

  it("compte les marques seules", () => {
    expect(nombreDeFiltres({ brand: ["Sony", "LG", "Apple"] })).toBe(3)
  })

  it("compte une clé unique renseignée seule", () => {
    expect(nombreDeFiltres({ categorySlug: "audio" })).toBe(1)
    expect(nombreDeFiltres({ priceBucketId: "0-1000" })).toBe(1)
  })
})

describe("retirerFacette", () => {
  const filtres: SearchFilters = {
    brand: ["Sony"],
    categorySlug: "audio-hifi",
    priceBucketId: "2500-5000",
  }

  it("retire la clause de la clé visée et garde les autres filtres", () => {
    expect(retirerFacette(filtres, "marque")).toEqual({
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
    expect(retirerFacette(filtres, "categorie")).toEqual({
      brand: ["Sony"],
      priceBucketId: "2500-5000",
    })
    expect(retirerFacette(filtres, "prix")).toEqual({
      brand: ["Sony"],
      categorySlug: "audio-hifi",
    })
  })

  it("laisse des filtres vides vides", () => {
    expect(retirerFacette({}, "marque")).toEqual({})
    expect(retirerFacette({}, "categorie")).toEqual({})
    expect(retirerFacette({}, "prix")).toEqual({})
  })

  it("supprime la clé au lieu de la vider et ne mute jamais son argument", () => {
    expect("brand" in retirerFacette(filtres, "marque")).toBe(false)
    expect("categorySlug" in retirerFacette(filtres, "categorie")).toBe(false)
    expect("priceBucketId" in retirerFacette(filtres, "prix")).toBe(false)

    const restants = retirerFacette(filtres, "marque")

    expect(restants).not.toBe(filtres)
    expect(filtres).toEqual({
      brand: ["Sony"],
      categorySlug: "audio-hifi",
      priceBucketId: "2500-5000",
    })
  })
})

describe("retirerValeur", () => {
  const filtres: SearchFilters = {
    brand: ["Sony", "LG", "Apple"],
    categorySlug: "audio",
    priceBucketId: "0-1000",
  }

  it("retire une marque et laisse les autres sélectionnées", () => {
    expect(retirerValeur(filtres, "marque", "LG")).toEqual({
      brand: ["Sony", "Apple"],
      categorySlug: "audio",
      priceBucketId: "0-1000",
    })
  })

  it("supprime le champ des marques quand la liste devient vide", () => {
    const restants = retirerValeur({ brand: ["Sony"] }, "marque", "Sony")

    expect(restants).toEqual({})
    expect("brand" in restants).toBe(false)
  })

  it("ne retire pas une marque absente et rend une nouvelle valeur", () => {
    const restants = retirerValeur(filtres, "marque", "Teufel")

    expect(restants).toEqual(filtres)
    expect(restants).not.toBe(filtres)
  })

  it("efface la catégorie seulement quand elle correspond", () => {
    const restants = retirerValeur(filtres, "categorie", "audio")

    expect(restants).toEqual({
      brand: ["Sony", "LG", "Apple"],
      priceBucketId: "0-1000",
    })
    expect("categorySlug" in restants).toBe(false)
  })

  it("efface la Tranche de prix seulement quand elle correspond", () => {
    const restants = retirerValeur(filtres, "prix", "0-1000")

    expect(restants).toEqual({
      brand: ["Sony", "LG", "Apple"],
      categorySlug: "audio",
    })
    expect("priceBucketId" in restants).toBe(false)
  })

  it("ne touche pas à une clé unique qui ne correspond pas", () => {
    const sansCategorie = retirerValeur(filtres, "categorie", "video")
    const sansPrix = retirerValeur(filtres, "prix", "2500-5000")

    expect(sansCategorie).toEqual(filtres)
    expect(sansPrix).toEqual(filtres)
    expect(sansCategorie).not.toBe(filtres)
    expect(sansPrix).not.toBe(filtres)
  })

  it("ne mute jamais son argument", () => {
    retirerValeur(filtres, "marque", "LG")
    retirerValeur(filtres, "marque", "Sony")
    retirerValeur(filtres, "categorie", "audio")
    retirerValeur(filtres, "prix", "0-1000")

    expect(filtres).toEqual({
      brand: ["Sony", "LG", "Apple"],
      categorySlug: "audio",
      priceBucketId: "0-1000",
    })
  })
})

describe("optionsVisibles", () => {
  function option(
    value: string,
    count: number,
    selected = false
  ): OptionDeFiltre {
    return { value, label: value, count, selected }
  }

  it("cache une Option à zéro non retenue et garde une Option à zéro retenue", () => {
    const options = [
      option("Sony", 2),
      option("Teufel", 0),
      option("LG", 0, true),
    ]

    expect(optionsVisibles(options)).toEqual({
      visibles: [option("Sony", 2), option("LG", 0, true)],
      cachees: 0,
    })
  })

  it("garde les premières Options retenues sous le plafond et compte les autres cachées", () => {
    const options = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((nom) =>
      option(nom, 1)
    )

    const { visibles, cachees } = optionsVisibles(options, 3)

    expect(visibles.map(({ value }) => value)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ])
    expect(cachees).toBe(2)
  })

  it("garde une Option retenue au-delà du plafond et ne la compte pas dans cachees", () => {
    const options = [
      option("Alpha", 1),
      option("Bravo", 1),
      option("Charlie", 1),
      option("Delta", 1),
      option("Echo", 0, true),
    ]

    const { visibles, cachees } = optionsVisibles(options, 3)

    expect(visibles.map(({ value }) => value)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Echo",
    ])
    expect(cachees).toBe(1)
  })

  it("ne compte dans cachees que ce que le plafond cache, pas les Options à zéro écartées", () => {
    const options = [
      option("Alpha", 1),
      option("Bravo", 0),
      option("Charlie", 1),
      option("Delta", 1),
      option("Echo", 1),
      option("Foxtrot", 1),
    ]

    const { visibles, cachees } = optionsVisibles(options, 3)

    expect(visibles.map(({ value }) => value)).toEqual([
      "Alpha",
      "Charlie",
      "Delta",
    ])
    expect(cachees).toBe(2)
  })

  it("déplie toutes les Options retenues et ne cache rien", () => {
    const options = Array.from({ length: 10 }, (_, index) =>
      option(`Option ${index + 1}`, 1)
    )

    const { visibles, cachees } = optionsVisibles(options, 3, true)

    expect(visibles).toEqual(options)
    expect(cachees).toBe(0)
  })

  it("ne replie rien quand le plafond est omis, comme le groupe Prix", () => {
    const options = Array.from({ length: 12 }, (_, index) =>
      option(`Tranche ${index + 1}`, 1)
    )

    expect(optionsVisibles(options)).toEqual({ visibles: options, cachees: 0 })
    expect(optionsVisibles(options, undefined, false)).toEqual({
      visibles: options,
      cachees: 0,
    })
  })

  it("rend des tableaux neufs sans muter la liste ni ses Options", () => {
    const options = [
      option("Alpha", 1),
      option("Bravo", 0),
      option("Charlie", 0, true),
    ]
    const copie = options.map((option) => ({ ...option }))

    const replie = optionsVisibles(options, 1)
    const deplie = optionsVisibles(options, 1, true)

    expect(options).toEqual(copie)
    expect(replie.visibles).not.toBe(options)
    expect(deplie.visibles).not.toBe(options)
    expect(replie.visibles).not.toBe(deplie.visibles)
  })
})
