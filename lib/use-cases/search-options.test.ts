import { describe, expect, it } from "vitest"

import { etatDesFiltres } from "@/lib/filtre-de-recherche"
import type { SearchFilters } from "@/lib/search-params"
import {
  lectureDesStructures,
  type FaitStructure,
  type LectureStructure,
} from "@/lib/use-cases/lecture-structure"
import { searchProducts } from "@/lib/use-cases/search"
import {
  creerMoteurIndisponible,
  creerMoteurRecette,
} from "@/test/moteur-recherche-recette"
import { tranchesAttendues } from "@/test/recherche-fixtures"

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

const REPARTITIONS_VIDES = { marque: {}, categorie: {}, prix: {} }

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

describe("le câblage des Options de filtre, à la couture de la Recherche", () => {
  it("résout les noms de catégorie par la Structure et les fait atteindre la charge utile", async () => {
    const moteur = creerMoteurRecette({
      statut: "ok",
      documents: [],
      total: 0,
      repartitions: { categorySlug: { "z-slug": 1, "e-slug": 2 } },
    })

    const resultat = await searchProducts("", {}, {}, moteur, structure)

    expect(resultat.options.categorie).toEqual([
      { value: "z-slug", label: "Éclairage", count: 1, selected: false },
      { value: "e-slug", label: "Zoos", count: 2, selected: false },
    ])
  })

  it("résout le nom d'une catégorie retenue absente des répartitions", async () => {
    const moteur = creerMoteurRecette({
      statut: "ok",
      documents: [],
      total: 0,
      repartitions: { categorySlug: { "e-slug": 1 } },
    })

    const resultat = await searchProducts(
      "",
      { categorySlug: "z-slug" },
      {},
      moteur,
      structure
    )

    expect(resultat.options.categorie).toContainEqual({
      value: "z-slug",
      label: "Éclairage",
      count: 0,
      selected: true,
    })
  })

  it("fait atteindre la charge utile les répartitions des trois facettes du moteur", async () => {
    const moteur = creerMoteurRecette({
      statut: "ok",
      documents: [],
      total: 0,
      repartitions: {
        brand: { Sony: 2 },
        categorySlug: { audio: 1 },
        priceBucket: { "0-1000": 2 },
      },
    })

    const resultat = await searchProducts("", {}, {}, moteur, structure)

    expect(resultat.options.marque).toEqual([
      { value: "Sony", label: "Sony", count: 2, selected: false },
    ])
    expect(resultat.options.categorie).toEqual([
      { value: "audio", label: "Audio & Hi-Fi", count: 1, selected: false },
    ])
    expect(resultat.options.prix).toEqual(tranchesAttendues({ "0-1000": 2 }))

    const requetesDeFacette = moteur.requetes.filter(
      (requete) => (requete.taille ?? 0) === 0
    )
    expect(requetesDeFacette.map(({ facettes }) => facettes)).toEqual([
      ["brand"],
      ["categorySlug"],
      ["priceBucket"],
    ])
  })

  it("répond le même état vide que l'entrée d'assemblage quand le moteur est indisponible", async () => {
    const filtres: SearchFilters = {
      brand: ["Sony"],
      categorySlug: "audio-hifi",
      priceBucketId: "1000-2500",
    }

    const resultat = await searchProducts(
      "casque",
      filtres,
      {},
      creerMoteurIndisponible(),
      structureJamaisLue()
    )

    expect({
      options: resultat.options,
      filtresActifs: resultat.filtresActifs,
    }).toEqual(etatDesFiltres(REPARTITIONS_VIDES, filtres, new Map()))
  })
})
