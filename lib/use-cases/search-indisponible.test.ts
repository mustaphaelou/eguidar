import { describe, expect, it } from "vitest"

import type { MoteurRecherche, RequeteMoteur } from "@/lib/moteur-recherche"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import type { LectureStructure } from "@/lib/use-cases/lecture-structure"
import {
  searchProducts,
  searchSuggestions,
  SEARCH_PAGE_SIZE,
} from "@/lib/use-cases/search"
import {
  creerMoteurIndisponible,
  creerMoteurRecette,
} from "@/test/moteur-recherche-recette"

type MoteurRecette = MoteurRecherche & { requetes: RequeteMoteur[] }

function requetesPage(moteur: MoteurRecette): RequeteMoteur[] {
  return moteur.requetes.filter((requete) => (requete.taille ?? 0) > 0)
}

function moteurCatalogueVide(): MoteurRecette {
  return creerMoteurRecette({
    statut: "ok",
    documents: [],
    total: 0,
    repartitions: {},
  })
}

function structureJamaisLue(): LectureStructure {
  const refuser = () => {
    throw new Error(
      "la Structure ne doit pas être lue quand le moteur ne rend rien"
    )
  }
  return {
    arbreAccueil: refuser,
    lignesAdmin: refuser,
    ciblesSuppression: refuser,
    options: refuser,
    structure: refuser,
    structureParSlug: refuser,
    filAriane: refuser,
    enfants: refuser,
    branche: refuser,
  }
}

const BANDES_A_ZERO = PRICE_BUCKETS.map(({ id, label }) => ({
  value: id,
  label,
  count: 0,
  selected: false,
}))

const DTO_PAGE_VIDE = {
  query: "casque",
  totalHits: 0,
  products: [],
  facets: { brands: [], categories: [], priceBuckets: BANDES_A_ZERO },
  filtresActifs: [],
  sort: "pertinence",
  currentPage: 1,
  totalPages: 1,
  pageSize: 2,
}

describe("les cas d'usage — un moteur indisponible rend l'écran d'aujourd'hui", () => {
  it("searchProducts répond le DTO vide, à la taille de page demandée", async () => {
    await expect(
      searchProducts(
        "casque",
        {},
        { page: 3, pageSize: 2 },
        creerMoteurIndisponible(),
        structureJamaisLue()
      )
    ).resolves.toEqual(DTO_PAGE_VIDE)
  })

  it("searchSuggestions répond les deux listes vides", async () => {
    await expect(
      searchSuggestions(
        "casque",
        creerMoteurIndisponible(),
        structureJamaisLue()
      )
    ).resolves.toEqual({ products: [], categories: [] })
  })

  it("un Catalogue vide n'est pas une panne : la réponse ok rend le même DTO", async () => {
    await expect(
      searchProducts(
        "casque",
        {},
        { page: 3, pageSize: 2 },
        moteurCatalogueVide(),
        structureJamaisLue()
      )
    ).resolves.toEqual(DTO_PAGE_VIDE)
  })

  it("la panne n'ajoute aucune requête que le moteur ne peut pas servir", async () => {
    const indisponible = creerMoteurIndisponible()
    const catalogueVide = moteurCatalogueVide()

    await searchProducts(
      "casque",
      {},
      { page: 3, pageSize: 2 },
      indisponible,
      structureJamaisLue()
    )
    await searchProducts(
      "casque",
      {},
      { page: 3, pageSize: 2 },
      catalogueVide,
      structureJamaisLue()
    )

    expect(
      requetesPage(indisponible).map((requete) => requete.page ?? 1)
    ).toEqual([3])
    expect(
      requetesPage(catalogueVide).map((requete) => requete.page ?? 1)
    ).toEqual([3, 1])
  })

  it("une catégorie active reste émise à zéro, sans nomenclature lue", async () => {
    const indisponible = creerMoteurIndisponible()

    const resultat = await searchProducts(
      "casque",
      {
        brand: ["Sony"],
        categorySlug: "audio-hifi",
        priceBucketId: "1000-2500",
      },
      { page: 1 },
      indisponible,
      structureJamaisLue()
    )

    expect(resultat.facets.brands).toEqual([
      { value: "Sony", label: "Sony", count: 0, selected: true },
    ])
    expect(resultat.facets.categories).toEqual([
      { value: "audio-hifi", label: "audio-hifi", count: 0, selected: true },
    ])
    expect(
      resultat.facets.priceBuckets.filter((option) => option.selected)
    ).toEqual([
      {
        value: "1000-2500",
        label: "1 000 – 2 500 MAD",
        count: 0,
        selected: true,
      },
    ])
    expect(resultat.totalHits).toBe(0)
    expect(resultat.pageSize).toBe(SEARCH_PAGE_SIZE)

    expect(requetesPage(indisponible)).toHaveLength(1)
  })

  it("la panne projette les Filtres actifs depuis ses facettes brutes, sans lire la Structure", async () => {
    const resultat = await searchProducts(
      "casque",
      {
        brand: ["Sony"],
        categorySlug: "audio-hifi",
        priceBucketId: "1000-2500",
      },
      { page: 1 },
      creerMoteurIndisponible(),
      structureJamaisLue()
    )

    expect(resultat.filtresActifs).toEqual([
      {
        cle: "brand",
        valeur: "Sony",
        label: "Sony",
        ariaLabel: "Retirer la marque Sony",
      },
      {
        cle: "categorySlug",
        valeur: "audio-hifi",
        label: "audio-hifi",
        ariaLabel: "Retirer la catégorie audio-hifi",
      },
      {
        cle: "priceBucketId",
        valeur: "1000-2500",
        label: "1 000 – 2 500 MAD",
        ariaLabel: "Retirer la tranche de prix 1 000 – 2 500 MAD",
      },
    ])
  })

  it("searchSuggestions garde sa requête unique : six documents, les catégories comptées", async () => {
    const indisponible = creerMoteurIndisponible()

    await searchSuggestions("casque", indisponible, structureJamaisLue())

    expect(indisponible.requetes).toHaveLength(1)
    expect(indisponible.requetes[0]).toMatchObject({
      query: "casque",
      taille: 6,
      facettes: ["categorySlug"],
    })
  })
})
