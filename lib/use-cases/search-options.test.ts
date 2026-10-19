import { describe, expect, it } from "vitest"

import type { IndexableProduct } from "@/lib/index-projection"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"
import {
  lectureDesStructures,
  type FaitStructure,
} from "@/lib/use-cases/lecture-structure"
import {
  searchProducts,
  type OptionDeFiltre,
  type OptionsDeFiltre,
} from "@/lib/use-cases/search"
import { creerMoteurEnMemoire } from "@/test/moteur-recherche-memoire"
import { creerMoteurRecette } from "@/test/moteur-recherche-recette"

const BANDES_ATTENDUES = PRICE_BUCKETS.map(({ id }) => id)
const LIBELLES_ATTENDUS = PRICE_BUCKETS.map(({ label }) => label)

const FAITS: FaitStructure[] = [
  {
    id: "audio",
    name: "Audio & Hi-Fi",
    slug: "audio",
    image: null,
    parentId: null,
    produitsDirects: 0,
  },
  {
    id: "video",
    name: "Vidéo",
    slug: "video",
    image: null,
    parentId: null,
    produitsDirects: 0,
  },
  {
    id: "z-slug",
    name: "Éclairage",
    slug: "z-slug",
    image: null,
    parentId: null,
    produitsDirects: 0,
  },
  {
    id: "e-slug",
    name: "Zoos",
    slug: "e-slug",
    image: null,
    parentId: null,
    produitsDirects: 0,
  },
]

const structure = lectureDesStructures(FAITS)

function document(
  id: string,
  overrides: Partial<IndexableProduct> = {}
): IndexableProduct {
  return {
    id,
    name: `Option ${id}`,
    slug: `option-${id}`,
    description: "",
    brand: "Marque",
    price: 100000,
    minPrice: 100000,
    totalStock: 1,
    images: [],
    categorySlug: "audio",
    categoryName: "Documents",
    specsText: "",
    variantNames: [],
    skus: [],
    isFeatured: false,
    freeShipping: false,
    priceBucket: "1000-2500",
    updatedAt: 0,
    ...overrides,
  }
}

async function facettesPour(
  documents: IndexableProduct[],
  filtres: SearchFilters = {}
): Promise<OptionsDeFiltre> {
  const resultat = await searchProducts(
    "",
    filtres,
    {},
    creerMoteurEnMemoire(documents),
    structure
  )
  return resultat.facets
}

function tranchesAttendues(
  comptes: Record<string, number> = {},
  retenue?: string
): OptionDeFiltre[] {
  return PRICE_BUCKETS.map(({ id, label }) => ({
    value: id,
    label,
    count: comptes[id] ?? 0,
    selected: id === retenue,
  }))
}

describe("l'assemblage des Options de filtre, à la couture de la Recherche", () => {
  it("rend une option par valeur comptée, avec son décompte", async () => {
    const facettes = await facettesPour([
      document("sony-1", {
        brand: "Sony",
        categorySlug: "audio",
        minPrice: 50000,
        priceBucket: "0-1000",
      }),
      document("sony-2", {
        brand: "Sony",
        categorySlug: "audio",
        minPrice: 50000,
        priceBucket: "0-1000",
      }),
      document("lg-1", {
        brand: "LG",
        categorySlug: "video",
        minPrice: 600000,
        priceBucket: "5000-10000",
      }),
    ])

    expect(facettes.brands).toEqual([
      { value: "LG", label: "LG", count: 1, selected: false },
      { value: "Sony", label: "Sony", count: 2, selected: false },
    ])
    expect(facettes.categories).toEqual([
      {
        value: "audio",
        label: "Audio & Hi-Fi",
        count: 2,
        selected: false,
      },
      { value: "video", label: "Vidéo", count: 1, selected: false },
    ])
    expect(facettes.priceBuckets).toEqual(
      tranchesAttendues({ "0-1000": 2, "5000-10000": 1 })
    )
  })

  it("trie les marques par libellé sous la locale fr", async () => {
    const facettes = await facettesPour([
      document("zebra", { brand: "Zebra" }),
      document("electronique", { brand: "Électronique" }),
      document("apple", { brand: "apple" }),
    ])

    expect(facettes.brands.map((option) => option.value)).toEqual([
      "apple",
      "Électronique",
      "Zebra",
    ])
  })

  it("trie les catégories par leur nom résolu, pas par leur slug", async () => {
    const facettes = await facettesPour([
      document("eclairage", { categorySlug: "z-slug" }),
      document("zoos", { categorySlug: "e-slug" }),
    ])

    expect(facettes.categories.map((option) => option.label)).toEqual([
      "Éclairage",
      "Zoos",
    ])
  })

  it("garde l'ordre fixe des bandes, pas celui des décomptes", async () => {
    const facettes = await facettesPour([
      document("cher-1", { minPrice: 2000000, priceBucket: "10000-plus" }),
      document("cher-2", { minPrice: 2000000, priceBucket: "10000-plus" }),
      document("cher-3", { minPrice: 2000000, priceBucket: "10000-plus" }),
      document("abordable", { minPrice: 50000, priceBucket: "0-1000" }),
    ])

    expect(facettes.priceBuckets.map((option) => option.value)).toEqual(
      BANDES_ATTENDUES
    )
    expect(facettes.priceBuckets.map((option) => option.label)).toEqual(
      LIBELLES_ATTENDUS
    )
    expect(
      facettes.priceBuckets.map(({ value, count }) => [value, count])
    ).toEqual([
      ["0-1000", 1],
      ["1000-2500", 0],
      ["2500-5000", 0],
      ["5000-10000", 0],
      ["10000-plus", 3],
    ])
  })

  it("émet toutes les bandes de prix même sans aucune répartition", async () => {
    const facettes = await facettesPour([])

    expect(facettes.priceBuckets.map((option) => option.value)).toEqual(
      BANDES_ATTENDUES
    )
    expect(facettes.priceBuckets.every((option) => option.count === 0)).toBe(
      true
    )
  })

  it("émet une marque retenue absente de la répartition, à zéro et sélectionnée", async () => {
    const facettes = await facettesPour([document("sony", { brand: "Sony" })], {
      brand: ["Sony", "Teufel"],
    })

    expect(facettes.brands).toEqual([
      { value: "Sony", label: "Sony", count: 1, selected: true },
      { value: "Teufel", label: "Teufel", count: 0, selected: true },
    ])
  })

  it("émet une catégorie retenue absente de la répartition, avec son nom", async () => {
    const facettes = await facettesPour([document("audio", {})], {
      categorySlug: "video",
    })

    expect(facettes.categories).toEqual([
      {
        value: "audio",
        label: "Audio & Hi-Fi",
        count: 1,
        selected: false,
      },
      { value: "video", label: "Vidéo", count: 0, selected: true },
    ])
  })

  it("émet une valeur non retenue à zéro, que la barre latérale masquera", async () => {
    const moteur = creerMoteurRecette({
      statut: "ok",
      documents: [],
      total: 0,
      repartitions: {
        brand: { Sony: 0 },
        categorySlug: { audio: 0 },
        priceBucket: {},
      },
    })

    const resultat = await searchProducts("", {}, {}, moteur, structure)

    expect(resultat.facets.brands).toEqual([
      { value: "Sony", label: "Sony", count: 0, selected: false },
    ])
    expect(resultat.facets.categories).toEqual([
      {
        value: "audio",
        label: "Audio & Hi-Fi",
        count: 0,
        selected: false,
      },
    ])
  })

  it("retombe sur la valeur quand aucun libellé n'est résolu", async () => {
    const facettes = await facettesPour([
      document("inconnu", { categorySlug: "slug-inconnu" }),
    ])

    expect(facettes.categories).toEqual([
      {
        value: "slug-inconnu",
        label: "slug-inconnu",
        count: 1,
        selected: false,
      },
    ])
  })

  it("marque selected selon les filtres actifs, pour les trois listes", async () => {
    const documents = [
      document("lg", {
        brand: "LG",
        categorySlug: "video",
        minPrice: 300000,
        priceBucket: "2500-5000",
      }),
      document("sony", {
        brand: "Sony",
        categorySlug: "video",
        minPrice: 300000,
        priceBucket: "2500-5000",
      }),
    ]
    const facettes = await facettesPour(documents, {
      brand: ["LG"],
      categorySlug: "video",
      priceBucketId: "2500-5000",
    })

    expect(facettes.brands.map((option) => option.selected)).toEqual([
      true,
      false,
    ])
    expect(facettes.categories).toEqual([
      { value: "video", label: "Vidéo", count: 1, selected: true },
    ])
    expect(
      facettes.priceBuckets
        .filter((option) => option.selected)
        .map((option) => option.value)
    ).toEqual(["2500-5000"])
    expect(
      facettes.priceBuckets.filter((option) => option.selected)
    ).toHaveLength(1)
  })

  it("ignore une valeur hors de l'univers des bandes", async () => {
    const moteur = creerMoteurRecette({
      statut: "ok",
      documents: [],
      total: 0,
      repartitions: {
        brand: {},
        categorySlug: {},
        priceBucket: { "bande-obsolete": 4 },
      },
    })

    const resultat = await searchProducts("", {}, {}, moteur, structure)

    expect(resultat.facets.priceBuckets.map((option) => option.value)).toEqual(
      BANDES_ATTENDUES
    )
    expect(
      resultat.facets.priceBuckets.every((option) => option.count === 0)
    ).toBe(true)
  })
})
