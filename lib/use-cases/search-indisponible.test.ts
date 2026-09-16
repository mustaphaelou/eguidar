import type { Meilisearch } from "meilisearch"
import { describe, expect, it } from "vitest"

import { chercherAvecMeili } from "@/lib/meili"
import type { MoteurRecherche, RequeteMoteur } from "@/lib/moteur-recherche"
import {
  searchProducts,
  searchSuggestions,
  SEARCH_PAGE_SIZE,
} from "@/lib/use-cases/search"
import {
  creerMoteurIndisponible,
  creerMoteurRecette,
} from "@/test/moteur-recherche-recette"

/**
 * L'indisponibilité du Moteur de recherche a deux visages — `MEILI_URL` absent,
 * et un moteur configuré mais injoignable — et un seul fait typé au-dessus de
 * la couture. Ce fichier tourne sans `MEILI_URL` et sans Docker : il remet à
 * `chercherAvecMeili` un client nul ou un client de façade, et aux cas d'usage
 * un moteur de recette, pour figer le rendu d'aujourd'hui : un Catalogue vide.
 */

type MoteurRecette = MoteurRecherche & { requetes: RequeteMoteur[] }

/** Un client Meili de façade : la couture ne lui parle que par `index().search()`. */
function clientQuiRejette(): { client: Meilisearch; appels: string[] } {
  const appels: string[] = []
  const client = {
    index: (uid: string) => ({
      search: (query: string) => {
        appels.push(`${uid}:${query}`)
        return Promise.reject(new Error("boom"))
      },
    }),
  } as unknown as Meilisearch
  return { client, appels }
}

/** Les requêtes qui demandent des documents, par opposition aux comptages `taille: 0`. */
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

/**
 * L'univers des Tranches de prix sans résultat : l'assemblage les émet
 * toutes, à zéro, et c'est la barre latérale qui masque celles qu'elle doit
 * masquer.
 */
const BANDES_A_ZERO = [
  { value: "0-1000", label: "Moins de 1 000 MAD", count: 0, selected: false },
  { value: "1000-2500", label: "1 000 – 2 500 MAD", count: 0, selected: false },
  { value: "2500-5000", label: "2 500 – 5 000 MAD", count: 0, selected: false },
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
]

/**
 * Le DTO de l'écran vide : le Catalogue vide et les options d'une réponse
 * sans résultat — aucune marque, aucune catégorie, les cinq bandes à zéro.
 * Une panne comme un Catalogue vide l'assemblent de la même façon, sans
 * nomenclature lue.
 */
const DTO_PAGE_VIDE = {
  query: "casque",
  totalHits: 0,
  products: [],
  facets: { brands: [], categories: [], priceBuckets: BANDES_A_ZERO },
  sort: "pertinence",
  currentPage: 1,
  totalPages: 1,
  pageSize: 2,
}

describe("l'adaptateur Meili — les deux visages de l'indisponibilité", () => {
  it("sans MEILI_URL, le client nul répond indisponible", async () => {
    await expect(
      chercherAvecMeili(null, {
        query: "casque",
        taille: 24,
        facettes: ["brand", "categorySlug", "priceBucket"],
      })
    ).resolves.toEqual({ statut: "indisponible" })
  })

  it("un moteur injoignable : le rejet est converti à la couture", async () => {
    const { client, appels } = clientQuiRejette()

    await expect(
      chercherAvecMeili(client, {
        query: "casque",
        taille: 24,
        facettes: ["brand", "categorySlug", "priceBucket"],
      })
    ).resolves.toEqual({ statut: "indisponible" })

    // le rejet vient bien d'un appel tenté, pas d'un court-circuit
    expect(appels.length).toBeGreaterThan(0)
  })
})

describe("les cas d'usage — un moteur indisponible rend l'écran d'aujourd'hui", () => {
  it("searchProducts répond le DTO vide, à la taille de page demandée", async () => {
    await expect(
      searchProducts(
        "casque",
        {},
        { page: 3, pageSize: 2 },
        creerMoteurIndisponible()
      )
    ).resolves.toEqual(DTO_PAGE_VIDE)
  })

  it("searchSuggestions répond les deux listes vides", async () => {
    await expect(
      searchSuggestions("casque", creerMoteurIndisponible())
    ).resolves.toEqual({ products: [], categories: [] })
  })

  it("un Catalogue vide n'est pas une panne : la réponse ok rend le même DTO", async () => {
    await expect(
      searchProducts(
        "casque",
        {},
        { page: 3, pageSize: 2 },
        moteurCatalogueVide()
      )
    ).resolves.toEqual(DTO_PAGE_VIDE)
  })

  it("la panne n'ajoute aucune requête que le moteur ne peut pas servir", async () => {
    const indisponible = creerMoteurIndisponible()
    const catalogueVide = moteurCatalogueVide()

    await searchProducts("casque", {}, { page: 3, pageSize: 2 }, indisponible)
    await searchProducts("casque", {}, { page: 3, pageSize: 2 }, catalogueVide)

    // la page demandée, une fois : rien à reclamper sans total
    expect(
      requetesPage(indisponible).map((requete) => requete.page ?? 1)
    ).toEqual([3])
    // un Catalogue vide, lui, se replie sur la première page et la redemande
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
      indisponible
    )

    // Le Catalogue vide est la réponse entière, mais l'assemblage tourne sur
    // une carte de libellés vide : chaque valeur retenue sort à zéro, et la
    // catégorie garde son slug pour libellé — la preuve qu'aucune
    // nomenclature n'est lue en base sur ce chemin. La barre latérale les
    // garde donc visibles, et les puces restent retirables.
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

    // une seule page demandée : la panne ne provoque aucun bornage
    expect(requetesPage(indisponible)).toHaveLength(1)
  })

  it("searchSuggestions garde sa requête unique : six documents, les catégories comptées", async () => {
    const indisponible = creerMoteurIndisponible()

    await searchSuggestions("casque", indisponible)

    // une seule requête, celle d'aujourd'hui : six documents, les catégories comptées
    expect(indisponible.requetes).toHaveLength(1)
    expect(indisponible.requetes[0]).toMatchObject({
      query: "casque",
      taille: 6,
      facettes: ["categorySlug"],
    })
  })
})
