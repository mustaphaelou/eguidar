import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  LIBELLE_SANS_STRUCTURE,
  SLUG_SANS_STRUCTURE,
  type IndexableProduct,
} from "@/lib/index-projection"
import type { MoteurRecherche, RequeteMoteur } from "@/lib/moteur-recherche"
import type { OptionDeFiltre } from "@/lib/use-cases/search"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import { lectureDesStructures } from "@/lib/use-cases/lecture-structure"
import {
  retirerFacette,
  searchProducts,
  searchSuggestions,
} from "@/lib/use-cases/search"
import { creerMoteurEnMemoire } from "@/test/moteur-recherche-memoire"
import {
  categoriesAttendues,
  exigerCinqCategoriesDistinctes,
  exigerCategoriesSemees,
  exigerCategoriesSuggestion,
  faitsSuggestionCategories,
  jeuSuggestionCategories,
  lesDeuxOrdres,
} from "@/test/suggestion-categories-recherche"

const moteurId = randomUUID().slice(0, 8)
const smartphonesSlug = `srchm-${moteurId}-smartphones`
const audioSlug = `srchm-${moteurId}-audio`
const token = `memoirerecherche${moteurId}`
const name = (label: string) => `MemoireRecherche${moteurId} ${label}`

function makeDoc(
  id: string,
  overrides: Partial<IndexableProduct> = {}
): IndexableProduct {
  return {
    id,
    name: "MemoireRecherche Produit",
    slug: `srchm-${moteurId}-${id}`,
    description: "Description de test",
    brand: "Marque",
    price: 100000,
    minPrice: 100000,
    totalStock: 5,
    images: [],
    categorySlug: smartphonesSlug,
    categoryName: "Smartphones",
    specsText: "",
    variantNames: [],
    skus: [],
    isFeatured: false,
    freeShipping: false,
    priceBucket: "0-1000",
    updatedAt: Date.now(),
    ...overrides,
  }
}

const docs: IndexableProduct[] = [
  makeDoc("iphone", {
    name: name("iPhone 15 Pro"),
    brand: "Apple",
    price: 1249900,
    minPrice: 1249900,
    priceBucket: "10000-plus",
    specsText: "Puce A17 Pro Caméra 48 MP",
    variantNames: ["128 Go", "256 Go"],
    skus: ["IP15P-128", "IP15P-256"],
    updatedAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
  }),
  makeDoc("samsung", {
    name: name("Samsung Galaxy S24"),
    brand: "Samsung",
    price: 699900,
    minPrice: 699900,
    priceBucket: "5000-10000",
    variantNames: ["256 Go"],
    skus: ["S24U-256"],
    updatedAt: new Date("2026-02-01T00:00:00.000Z").getTime(),
  }),
  makeDoc("casque", {
    name: name("Casque Sony WH-1000XM5"),
    brand: "Sony",
    categorySlug: audioSlug,
    categoryName: "Documents",
    price: 349900,
    minPrice: 349900,
    priceBucket: "2500-5000",
    freeShipping: true,
    updatedAt: new Date("2026-03-01T00:00:00.000Z").getTime(),
  }),
  makeDoc("ecran", {
    name: name("Écran 27 pouces 4K"),
    brand: "LG",
    categorySlug: audioSlug,
    categoryName: "Documents",
    price: 159900,
    minPrice: 159900,
    priceBucket: "1000-2500",
    updatedAt: new Date("2026-04-01T00:00:00.000Z").getTime(),
  }),
  makeDoc("clavier", {
    name: name("Clavier mécanique"),
    brand: "Logitech",
    price: 39900,
    minPrice: 39900,
    priceBucket: "0-1000",
    updatedAt: new Date("2026-05-01T00:00:00.000Z").getTime(),
  }),
]

const moteur = creerMoteurEnMemoire(docs)

const AUDIO_ATTENDU = { value: audioSlug, label: "Audio & Hi-Fi" }
const SMARTPHONES_ATTENDU = { value: smartphonesSlug, label: "Smartphones" }

const suggestionCategories = jeuSuggestionCategories(randomUUID().slice(0, 8))
const moteurSuggestions = creerMoteurEnMemoire(suggestionCategories.documents)

const FAITS_RECHERCHE = [
  {
    id: "smartphones",
    name: "Smartphones",
    slug: smartphonesSlug,
    image: null,
    parentId: null,
    produitsDirects: 3,
  },
  {
    id: "audio",
    name: "Audio & Hi-Fi",
    slug: audioSlug,
    image: null,
    parentId: null,
    produitsDirects: 2,
  },
]

const structure = lectureDesStructures([
  ...FAITS_RECHERCHE,
  ...faitsSuggestionCategories(suggestionCategories),
])

const moteurSansStructure = creerMoteurEnMemoire([
  makeDoc("orphelin", {
    name: name("Produit sans Structure"),
    categorySlug: SLUG_SANS_STRUCTURE,
    categoryName: LIBELLE_SANS_STRUCTURE,
  }),
  makeDoc("smartphone", {
    name: name("Produit avec Structure"),
  }),
])

const CINQ_MARQUES = [
  { value: "Apple", label: "Apple", count: 1 },
  { value: "LG", label: "LG", count: 1 },
  { value: "Logitech", label: "Logitech", count: 1 },
  { value: "Samsung", label: "Samsung", count: 1 },
  { value: "Sony", label: "Sony", count: 1 },
]

const CINQ_TRANCHES = PRICE_BUCKETS.map(({ id, label }) => ({
  value: id,
  label,
}))

const UNE_PAR_BANDE: Record<string, number> = {
  "0-1000": 1,
  "1000-2500": 1,
  "2500-5000": 1,
  "5000-10000": 1,
  "10000-plus": 1,
}

function marquesAttendues(retenues: string[] = []): OptionDeFiltre[] {
  return CINQ_MARQUES.map((marque) => ({
    ...marque,
    selected: retenues.includes(marque.value),
  }))
}

function tranchesAttendues(
  comptes: Record<string, number> = {},
  retenue?: string
): OptionDeFiltre[] {
  return CINQ_TRANCHES.map((tranche) => ({
    ...tranche,
    count: comptes[tranche.value] ?? 0,
    selected: tranche.value === retenue,
  }))
}

describe("searchProducts sur le moteur en mémoire", () => {
  it("rend les facettes avec des décomptes qui suivent le jeu de résultats", async () => {
    const result = await searchProducts(token, {}, {}, moteur, structure)

    expect(result.totalHits).toBe(5)
    expect(result.facets.brands).toEqual(marquesAttendues())
    expect(result.facets.categories).toEqual([
      { ...AUDIO_ATTENDU, count: 2, selected: false },
      { ...SMARTPHONES_ATTENDU, count: 3, selected: false },
    ])
    expect(result.facets.priceBuckets).toEqual(tranchesAttendues(UNE_PAR_BANDE))
  })

  it("filtre par marque et garde chaque marque comptable", async () => {
    const result = await searchProducts(
      token,
      { brand: ["Sony"] },
      {},
      moteur,
      structure
    )

    expect(result.products.map((p) => p.name)).toEqual([
      name("Casque Sony WH-1000XM5"),
    ])
    expect(result.totalHits).toBe(1)
    expect(result.facets.brands).toEqual(marquesAttendues(["Sony"]))
    expect(result.facets.categories).toEqual([
      { ...AUDIO_ATTENDU, count: 1, selected: false },
    ])
    expect(result.facets.priceBuckets).toEqual(
      tranchesAttendues({ "2500-5000": 1 })
    )
  })

  it("sélectionne plusieurs marques en union", async () => {
    const result = await searchProducts(
      token,
      { brand: ["Sony", "LG"] },
      {},
      moteur,
      structure
    )

    expect(result.totalHits).toBe(2)
    expect(result.products.map((p) => p.brand).sort()).toEqual(["LG", "Sony"])
    expect(result.facets.brands).toEqual(marquesAttendues(["Sony", "LG"]))
    expect(result.facets.categories).toEqual([
      { ...AUDIO_ATTENDU, count: 2, selected: false },
    ])
    expect(result.facets.priceBuckets).toEqual(
      tranchesAttendues({ "1000-2500": 1, "2500-5000": 1 })
    )
  })

  it("filtre par catégorie tout en comptant chaque catégorie", async () => {
    const result = await searchProducts(
      token,
      { categorySlug: smartphonesSlug },
      {},
      moteur,
      structure
    )

    expect(result.products.map((p) => p.name).sort()).toEqual(
      [
        name("Clavier mécanique"),
        name("Samsung Galaxy S24"),
        name("iPhone 15 Pro"),
      ].sort()
    )
    expect(result.facets.brands).toEqual([
      { value: "Apple", label: "Apple", count: 1, selected: false },
      { value: "Logitech", label: "Logitech", count: 1, selected: false },
      { value: "Samsung", label: "Samsung", count: 1, selected: false },
    ])
    expect(result.facets.categories).toEqual([
      { ...AUDIO_ATTENDU, count: 2, selected: false },
      { ...SMARTPHONES_ATTENDU, count: 3, selected: true },
    ])
  })

  it("rang et filtre les Produits sans Structure sous la valeur réservée", async () => {
    const result = await searchProducts(
      token,
      {},
      {},
      moteurSansStructure,
      structure
    )

    const option = result.facets.categories.find(
      (c) => c.value === SLUG_SANS_STRUCTURE
    )
    expect(option).toEqual({
      value: SLUG_SANS_STRUCTURE,
      label: LIBELLE_SANS_STRUCTURE,
      count: 1,
      selected: false,
    })
    expect(option?.label).not.toBe(SLUG_SANS_STRUCTURE)
  })

  it("garde la valeur brute d'un slug que la Structure ne nomme pas", async () => {
    const slugInconnu = `${token}-structure-inconnue`
    const moteurInconnu = creerMoteurEnMemoire([
      makeDoc("inconnu", { categorySlug: slugInconnu, description: token }),
    ])

    const result = await searchProducts(token, {}, {}, moteurInconnu, structure)

    expect(result.facets.categories).toEqual([
      {
        value: slugInconnu,
        label: slugInconnu,
        count: 1,
        selected: false,
      },
    ])
  })

  it("rend le libellé réservé même quand la Structure prétend connaître la valeur", async () => {
    const structureTrompeuse = lectureDesStructures([
      ...FAITS_RECHERCHE,
      {
        id: "valeur-reservee",
        name: "Une Structure impossible",
        slug: SLUG_SANS_STRUCTURE,
        image: null,
        parentId: null,
        produitsDirects: 0,
      },
    ])

    const result = await searchProducts(
      token,
      {},
      {},
      moteurSansStructure,
      structureTrompeuse
    )

    expect(result.facets.categories).toContainEqual({
      value: SLUG_SANS_STRUCTURE,
      label: LIBELLE_SANS_STRUCTURE,
      count: 1,
      selected: false,
    })
  })

  it("filtre réellement sur la valeur réservée, et non sur une puce inerte", async () => {
    const result = await searchProducts(
      token,
      { categorySlug: SLUG_SANS_STRUCTURE },
      {},
      moteurSansStructure,
      structure
    )

    expect(result.products.map((p) => p.name)).toEqual([
      name("Produit sans Structure"),
    ])
    expect(result.facets.categories).toContainEqual({
      value: SLUG_SANS_STRUCTURE,
      label: LIBELLE_SANS_STRUCTURE,
      count: 1,
      selected: true,
    })
  })

  it("garde la catégorie active visible à zéro, avec son nom", async () => {
    const result = await searchProducts(
      token,
      { brand: ["Apple"], categorySlug: audioSlug },
      {},
      moteur,
      structure
    )

    expect(result.totalHits).toBe(0)
    expect(result.facets.categories).toHaveLength(2)
    expect(result.facets.categories).toContainEqual({
      ...AUDIO_ATTENDU,
      count: 0,
      selected: true,
    })
    expect(result.facets.categories).toContainEqual({
      ...SMARTPHONES_ATTENDU,
      count: 1,
      selected: false,
    })
  })

  it("filtre par Tranche de prix tout en comptant chaque tranche", async () => {
    const result = await searchProducts(
      token,
      { priceBucketId: "0-1000" },
      {},
      moteur,
      structure
    )

    expect(result.products.map((p) => p.name)).toEqual([
      name("Clavier mécanique"),
    ])
    expect(result.totalHits).toBe(1)
    expect(result.facets.priceBuckets).toEqual(
      tranchesAttendues(UNE_PAR_BANDE, "0-1000")
    )
    expect(result.facets.brands).toEqual([
      { value: "Logitech", label: "Logitech", count: 1, selected: false },
    ])
    expect(result.facets.categories).toEqual([
      { ...SMARTPHONES_ATTENDU, count: 1, selected: false },
    ])
  })

  it("combine une requête texte et des facettes", async () => {
    const result = await searchProducts(
      `${token} sony`,
      { priceBucketId: "2500-5000" },
      {},
      moteur,
      structure
    )

    expect(result.products.map((p) => p.name)).toEqual([
      name("Casque Sony WH-1000XM5"),
    ])
  })

  it("rend l'état vide quand rien ne correspond", async () => {
    const result = await searchProducts("zzzqqqq", {}, {}, moteur, structure)

    expect(result.totalHits).toBe(0)
    expect(result.products).toEqual([])
    expect(result.facets.brands).toEqual([])
    expect(result.facets.categories).toEqual([])
    expect(result.facets.priceBuckets).toEqual(tranchesAttendues())
  })

  it("projette les Documents d'index en cartes de résultat", async () => {
    const result = await searchProducts(
      `${token} casque`,
      {},
      {},
      moteur,
      structure
    )

    expect(result.products[0]).toEqual({
      id: "casque",
      slug: `srchm-${moteurId}-casque`,
      name: name("Casque Sony WH-1000XM5"),
      brand: "Sony",
      image: null,
      minPrice: 349900,
      totalStock: 5,
      freeShipping: true,
    })
  })

  it("trouve par sku, par nom de déclinaison et par texte de caractéristiques", async () => {
    const bySku = await searchProducts(
      "ip15p",
      { categorySlug: smartphonesSlug },
      {},
      moteur,
      structure
    )
    expect(bySku.products.map((p) => p.name)).toEqual([name("iPhone 15 Pro")])

    const byVariant = await searchProducts(
      "128 go",
      { categorySlug: smartphonesSlug },
      {},
      moteur,
      structure
    )
    expect(byVariant.products.map((p) => p.name)).toEqual([
      name("iPhone 15 Pro"),
    ])

    const bySpecs = await searchProducts(
      "a17 pro",
      { categorySlug: smartphonesSlug },
      {},
      moteur,
      structure
    )
    expect(bySpecs.products.map((p) => p.name)).toEqual([name("iPhone 15 Pro")])
  })

  it("trie par prix croissant et décroissant", async () => {
    const asc = await searchProducts(
      token,
      {},
      { sort: "prix-asc" },
      moteur,
      structure
    )
    expect(asc.products.map((p) => p.name)).toEqual([
      name("Clavier mécanique"),
      name("Écran 27 pouces 4K"),
      name("Casque Sony WH-1000XM5"),
      name("Samsung Galaxy S24"),
      name("iPhone 15 Pro"),
    ])

    const desc = await searchProducts(
      token,
      {},
      { sort: "prix-desc" },
      moteur,
      structure
    )
    expect(desc.products.map((p) => p.name)).toEqual([
      name("iPhone 15 Pro"),
      name("Samsung Galaxy S24"),
      name("Casque Sony WH-1000XM5"),
      name("Écran 27 pouces 4K"),
      name("Clavier mécanique"),
    ])
  })

  it("trie les nouveautés par updatedAt décroissant", async () => {
    const result = await searchProducts(
      token,
      {},
      { sort: "nouveautes" },
      moteur,
      structure
    )

    expect(result.products.map((p) => p.name)).toEqual([
      name("Clavier mécanique"),
      name("Écran 27 pouces 4K"),
      name("Casque Sony WH-1000XM5"),
      name("Samsung Galaxy S24"),
      name("iPhone 15 Pro"),
    ])
  })

  it("pagine et rapporte les métadonnées de page", async () => {
    const result = await searchProducts(
      token,
      {},
      { sort: "prix-asc", page: 2, pageSize: 2 },
      moteur,
      structure
    )

    expect(result.currentPage).toBe(2)
    expect(result.totalPages).toBe(3)
    expect(result.pageSize).toBe(2)
    expect(result.totalHits).toBe(5)
    expect(result.products.map((p) => p.id)).toEqual(["casque", "samsung"])
  })

  it("redresse une page hors bornes sur la dernière page", async () => {
    const result = await searchProducts(
      token,
      {},
      { sort: "prix-asc", page: 99, pageSize: 2 },
      moteur,
      structure
    )

    expect(result.currentPage).toBe(3)
    expect(result.totalPages).toBe(3)
    expect(result.products.map((p) => p.id)).toEqual(["iphone"])
  })

  it("rapporte une seule page et la page 1 pour la taille par défaut", async () => {
    const result = await searchProducts(token, {}, {}, moteur, structure)

    expect(result.currentPage).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.pageSize).toBe(24)
  })
})

describe("ADR-0016 — retirerFacette sous l'orchestration", () => {
  it("un décompte de facette ignore son propre filtre, avec deux marques", async () => {
    const brand = ["Sony", "LG"]
    const result = await searchProducts(token, { brand }, {}, moteur, structure)

    expect(result.totalHits).toBe(2)
    expect(result.facets.brands).toEqual(marquesAttendues(["Sony", "LG"]))

    const sansMarque = await moteur.chercher({
      query: token,
      filtres: retirerFacette({ brand }, "brand"),
      taille: 0,
      facettes: ["brand"],
    })
    if (sansMarque.statut !== "ok") throw new Error("moteur indisponible")
    expect(sansMarque.repartitions.brand).toEqual({
      Apple: 1,
      LG: 1,
      Logitech: 1,
      Samsung: 1,
      Sony: 1,
    })
  })
})

describe("searchSuggestions sur le moteur en mémoire", () => {
  it("plafonne les suggestions à six produits", async () => {
    const suggestions = await searchSuggestions(
      suggestionCategories.token,
      moteurSuggestions,
      structure
    )

    expect(suggestions.products).toHaveLength(6)
    expect(suggestions.products.map((p) => p.id)).toEqual([
      `suggestion-${suggestionCategories.id}-g-1`,
      `suggestion-${suggestionCategories.id}-f-1`,
      `suggestion-${suggestionCategories.id}-e-1`,
      `suggestion-${suggestionCategories.id}-e-2`,
      `suggestion-${suggestionCategories.id}-d-1`,
      `suggestion-${suggestionCategories.id}-d-2`,
    ])
  })

  it("projette les six faits depuis un Document d'index complet", async () => {
    const document = makeDoc("projection", {
      name: name("Suggestion projection"),
      description: token,
      images: ["/images/suggestion.webp"],
      minPrice: 123456,
      totalStock: 0,
      freeShipping: true,
    })
    const moteurDocument = creerMoteurEnMemoire([document])

    const suggestions = await searchSuggestions(
      token,
      moteurDocument,
      structure
    )

    expect(suggestions.products).toEqual([
      {
        id: "projection",
        name: name("Suggestion projection"),
        slug: `srchm-${moteurId}-projection`,
        brand: "Marque",
        image: "/images/suggestion.webp",
        minPrice: 123456,
      },
    ])
  })

  it("rend la distribution des catégories du jeu principal", async () => {
    const suggestions = await searchSuggestions(token, moteur, structure)

    expect(suggestions.categories.map((c) => c.name).sort()).toEqual([
      "Audio & Hi-Fi",
      "Smartphones",
    ])
    expect(suggestions.categories.map((c) => c.slug).sort()).toEqual(
      [audioSlug, smartphonesSlug].sort()
    )
  })
})

function moteurAuxClesParSlug(moteur: MoteurRecherche): MoteurRecherche {
  return {
    async chercher(requete: RequeteMoteur) {
      const reponse = await moteur.chercher(requete)
      if (reponse.statut !== "ok") return reponse
      return {
        ...reponse,
        repartitions: Object.fromEntries(
          Object.entries(reponse.repartitions).map(([facette, comptes]) => [
            facette,
            Object.fromEntries(
              Object.entries(comptes ?? {}).sort(([gauche], [droite]) =>
                gauche < droite ? -1 : gauche > droite ? 1 : 0
              )
            ),
          ])
        ),
      }
    },
  }
}

function moteurAuxComptes(
  slugSurfacture: string,
  compte: number
): MoteurRecherche {
  const sain = moteurSuggestions
  return {
    async chercher(requete: RequeteMoteur) {
      const reponse = await sain.chercher(requete)
      if (
        reponse.statut !== "ok" ||
        !requete.facettes?.includes("categorySlug")
      )
        return reponse
      return {
        ...reponse,
        repartitions: {
          ...reponse.repartitions,
          categorySlug: {
            ...reponse.repartitions.categorySlug,
            [slugSurfacture]: compte,
          },
        },
      }
    },
  }
}

describe("les catégories que la Recherche propose, sur le moteur en mémoire", () => {
  it("le jeu semé se classe autrement dans les deux ordres", () => {
    const { parAlphabet, parComptes } = lesDeuxOrdres(suggestionCategories)

    expect(parAlphabet).not.toEqual(parComptes)
    expect(parAlphabet).toHaveLength(7)
    expect(parComptes).toHaveLength(7)
    expect(parAlphabet.slice(0, 5)).not.toEqual(
      categoriesAttendues(suggestionCategories).map(
        (categorie) => categorie.slug
      )
    )
  })

  it("les sept catégories ont atterri, avec les comptes qu'elles déclarent", async () => {
    await exigerCategoriesSemees(suggestionCategories, moteurSuggestions)
  })

  it("ouvre sur les catégories que la requête concerne le plus, plafond compris", async () => {
    const suggestions = await exigerCategoriesSuggestion(
      suggestionCategories,
      moteurSuggestions,
      structure
    )

    await exigerCinqCategoriesDistinctes(suggestions)
  })

  it("rend la même réponse à un moteur qui rend ses clés dans l'ordre des slugs", async () => {
    const suggestions = await exigerCategoriesSuggestion(
      suggestionCategories,
      moteurAuxClesParSlug(moteurSuggestions)
    )

    await exigerCinqCategoriesDistinctes(suggestions)
  })

  it("refuse l'attente quand un moteur annonce d'autres comptes", async () => {
    await expect(
      exigerCategoriesSuggestion(
        suggestionCategories,
        moteurAuxComptes(suggestionCategories.categories[0].slug, 99)
      )
    ).rejects.toThrow("les suggestions ouvrent sur les catégories")
  })
})
