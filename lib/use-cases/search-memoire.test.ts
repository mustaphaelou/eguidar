import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import type { IndexableProduct } from "@/lib/index-projection"
import type { OptionDeFiltre } from "@/lib/options-de-filtre"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import {
  retirerFacette,
  searchProducts,
  searchSuggestions,
} from "@/lib/use-cases/search"
import { creerMoteurEnMemoire } from "@/test/moteur-recherche-memoire"

/**
 * L'orchestration de la Recherche par-dessus la couture du MoteurRecherche
 * (ADR-0023), sur le moteur en mémoire.
 *
 * Ces faits — décomptes de facettes, règle d'ADR-0016, filtres, tris,
 * pagination et son redressement, état vide, suggestions — vivaient dans le
 * bloc `describe.runIf(!!meili)` de `lib/use-cases/search.test.ts` et ne
 * tournaient donc jamais sur la CI, qui ne démarre pas Meilisearch. Ils ne
 * demandent aucun moteur : ils traversent `searchProducts` /
 * `searchSuggestions` avec `creerMoteurEnMemoire(docs)`.
 *
 * Restent à Meili — et restent dans le bloc sous condition — la tolérance aux
 * fautes de frappe, l'insensibilité à la casse et aux accents, et le
 * classement par pertinence, que le double ne prétend pas imiter.
 *
 * `searchProducts` résout les **noms** de catégorie par Prisma
 * (`fetchCategoryNames`, `lib/use-cases/search.ts`) : cette suite demande
 * donc Postgres, jamais `MEILI_URL` ni Docker.
 */

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
    categoryId: "cat",
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

/**
 * Le même jeu que le bloc Meili d'origine, à une exception : les
 * `categoryName` des documents sont des valeurs quelconques, parce que le nom
 * affiché d'une catégorie vient de Postgres (`fetchCategoryNames`) et jamais
 * du Document d'index. Seul le nom semé en base est éprouvé.
 */
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

/** Sept catégories pour la suggestion : le plafond de cinq doit mordre. */
const CATEGORIES_SUGGESTION = Array.from({ length: 7 }, (_, index) => ({
  slug: `srchm-${moteurId}-suggestion-cat-${index}`,
  name: `SuggestionCat${index}`,
}))

/** Les cinq marques du jeu, dans l'ordre `fr` que l'assemblage rend. */
const CINQ_MARQUES = [
  { value: "Apple", label: "Apple", count: 1 },
  { value: "LG", label: "LG", count: 1 },
  { value: "Logitech", label: "Logitech", count: 1 },
  { value: "Samsung", label: "Samsung", count: 1 },
  { value: "Sony", label: "Sony", count: 1 },
]

/**
 * Les cinq Tranches de prix, dans l'ordre fixe de leurs bandes : leur
 * univers est `PRICE_BUCKETS`, donc une sixième bande ne peut pas
 * désynchroniser cette attente sans que le module la porte aussi.
 */
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

/** Les cinq marques attendues, `selected` compris selon les filtres actifs. */
function marquesAttendues(retenues: string[] = []): OptionDeFiltre[] {
  return CINQ_MARQUES.map((marque) => ({
    ...marque,
    selected: retenues.includes(marque.value),
  }))
}

/**
 * Les Tranches de prix attendues pour un jeu de décomptes. Depuis #371 la
 * liste est complète : une bande sans résultat sort à zéro, et c'est la
 * barre latérale qui masque celles qu'elle doit masquer.
 */
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

beforeAll(async () => {
  // `test/global-setup.ts` tronque la base entre invocations, pas entre
  // fichiers : d'où `skipDuplicates` à l'écriture et `deleteMany` à la sortie.
  await prisma.category.createMany({
    data: [
      { name: "Smartphones", slug: smartphonesSlug },
      { name: "Audio & Hi-Fi", slug: audioSlug },
      ...CATEGORIES_SUGGESTION,
    ],
    skipDuplicates: true,
  })
})

afterAll(async () => {
  await prisma.category.deleteMany({
    where: {
      slug: {
        in: [
          smartphonesSlug,
          audioSlug,
          ...CATEGORIES_SUGGESTION.map((category) => category.slug),
        ],
      },
    },
  })
  await prisma.$disconnect()
})

describe("searchProducts sur le moteur en mémoire", () => {
  it("rend les facettes avec des décomptes qui suivent le jeu de résultats", async () => {
    const result = await searchProducts(token, {}, {}, moteur)

    expect(result.totalHits).toBe(5)
    expect(result.facets.brands).toEqual(marquesAttendues())
    // Le nom vient de Postgres ; un slug inconnu de la base retombe sur lui-même.
    expect(result.facets.categories).toEqual([
      { ...AUDIO_ATTENDU, count: 2, selected: false },
      { ...SMARTPHONES_ATTENDU, count: 3, selected: false },
    ])
    expect(result.facets.priceBuckets).toEqual(tranchesAttendues(UNE_PAR_BANDE))
  })

  it("filtre par marque et garde chaque marque comptable", async () => {
    const result = await searchProducts(token, { brand: ["Sony"] }, {}, moteur)

    expect(result.products.map((p) => p.name)).toEqual([
      name("Casque Sony WH-1000XM5"),
    ])
    expect(result.totalHits).toBe(1)
    // ADR-0016 : le décompte des marques ignore le filtre de marque.
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
      moteur
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
      moteur
    )

    // Le tri par pertinence est l'ordre d'entrée du moteur en mémoire : la
    // suite éprouve le jeu rendu, pas l'ordre dans lequel il est rendu.
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

  it("garde la catégorie active visible à zéro, avec son nom", async () => {
    const result = await searchProducts(
      token,
      { brand: ["Apple"], categorySlug: audioSlug },
      {},
      moteur
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
      moteur
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
      moteur
    )

    expect(result.products.map((p) => p.name)).toEqual([
      name("Casque Sony WH-1000XM5"),
    ])
  })

  it("rend l'état vide quand rien ne correspond", async () => {
    const result = await searchProducts("zzzqqqq", {}, {}, moteur)

    expect(result.totalHits).toBe(0)
    expect(result.products).toEqual([])
    expect(result.facets.brands).toEqual([])
    expect(result.facets.categories).toEqual([])
    // L'univers des bandes est connu : la liste sort complète, à zéro, et
    // c'est la barre latérale qui masque les bandes sans résultat.
    expect(result.facets.priceBuckets).toEqual(tranchesAttendues())
  })

  it("projette les Documents d'index en cartes de résultat", async () => {
    const result = await searchProducts(`${token} casque`, {}, {}, moteur)

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
      moteur
    )
    expect(bySku.products.map((p) => p.name)).toEqual([name("iPhone 15 Pro")])

    const byVariant = await searchProducts(
      "128 go",
      { categorySlug: smartphonesSlug },
      {},
      moteur
    )
    expect(byVariant.products.map((p) => p.name)).toEqual([
      name("iPhone 15 Pro"),
    ])

    const bySpecs = await searchProducts(
      "a17 pro",
      { categorySlug: smartphonesSlug },
      {},
      moteur
    )
    expect(bySpecs.products.map((p) => p.name)).toEqual([name("iPhone 15 Pro")])
  })

  it("trie par prix croissant et décroissant", async () => {
    const asc = await searchProducts(token, {}, { sort: "prix-asc" }, moteur)
    expect(asc.products.map((p) => p.name)).toEqual([
      name("Clavier mécanique"),
      name("Écran 27 pouces 4K"),
      name("Casque Sony WH-1000XM5"),
      name("Samsung Galaxy S24"),
      name("iPhone 15 Pro"),
    ])

    const desc = await searchProducts(token, {}, { sort: "prix-desc" }, moteur)
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
      moteur
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
    // Le tri du jeu est celui de la suite, jamais l'ordre d'entrée du moteur :
    // `pertinence` en mémoire ne promet aucun classement.
    const result = await searchProducts(
      token,
      {},
      { sort: "prix-asc", page: 2, pageSize: 2 },
      moteur
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
      moteur
    )

    expect(result.currentPage).toBe(3)
    expect(result.totalPages).toBe(3)
    expect(result.products.map((p) => p.id)).toEqual(["iphone"])
  })

  it("rapporte une seule page et la page 1 pour la taille par défaut", async () => {
    const result = await searchProducts(token, {}, {}, moteur)

    expect(result.currentPage).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.pageSize).toBe(24)
  })
})

describe("ADR-0016 — retirerFacette sous l'orchestration", () => {
  it("un décompte de facette ignore son propre filtre, avec deux marques", async () => {
    const brand = ["Sony", "LG"]
    const result = await searchProducts(token, { brand }, {}, moteur)

    // Le jeu de résultats subit l'union des marques (2 produits) tandis que
    // le décompte des marques la retire — il est calculé sous
    // `retirerFacette({ brand }, "brand")` et compte les cinq marques.
    expect(result.totalHits).toBe(2)
    expect(result.facets.brands).toEqual(marquesAttendues(["Sony", "LG"]))

    // La même règle, affirmée directement sur le moteur : c'est
    // l'orchestration qui retire la clause avant l'appel, et le moteur
    // applique exactement les filtres qu'il reçoit.
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
  const sujets: IndexableProduct[] = Array.from({ length: 8 }, (_, index) => {
    const categorie =
      CATEGORIES_SUGGESTION[index % CATEGORIES_SUGGESTION.length]
    return makeDoc(`suggestion-${index}`, {
      name: name(`Suggestion ${index}`),
      slug: `srchm-${moteurId}-suggestion-${index}`,
      brand: "Marque Suggestions",
      description: `${token} suggestions`,
      categorySlug: categorie.slug,
      categoryName: categorie.name,
      minPrice: 100000 + index,
      priceBucket: "1000-2500",
    })
  })
  const moteurSuggestions = creerMoteurEnMemoire(sujets)

  it("plafonne les suggestions à six produits", async () => {
    const suggestions = await searchSuggestions(token, moteurSuggestions)

    // Huit documents correspondent : `searchSuggestions` en demande six.
    expect(suggestions.products).toHaveLength(6)
    expect(suggestions.products.map((p) => p.id)).toEqual([
      "suggestion-0",
      "suggestion-1",
      "suggestion-2",
      "suggestion-3",
      "suggestion-4",
      "suggestion-5",
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

    const suggestions = await searchSuggestions(token, moteurDocument)

    // Le Document complet porte aussi le stock et la livraison ; la suggestion
    // expose seulement les six faits, et une absence de stock ne la masque pas.
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

  it("plafonne la distribution des catégories à cinq, noms compris", async () => {
    const suggestions = await searchSuggestions(token, moteurSuggestions)

    // Les huit documents couvrent les sept catégories semées : la suggestion
    // n'en rend que cinq, avec le nom résolu par Prisma.
    expect(suggestions.categories).toEqual(
      CATEGORIES_SUGGESTION.slice(0, 5).map((category) => ({
        slug: category.slug,
        name: category.name,
      }))
    )
  })

  it("rend la distribution des catégories du jeu principal", async () => {
    const suggestions = await searchSuggestions(token, moteur)

    expect(suggestions.categories.map((c) => c.name).sort()).toEqual([
      "Audio & Hi-Fi",
      "Smartphones",
    ])
    expect(suggestions.categories.map((c) => c.slug).sort()).toEqual(
      [audioSlug, smartphonesSlug].sort()
    )
  })
})
