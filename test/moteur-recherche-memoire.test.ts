import { describe, expect, it } from "vitest"

import { retirerFacette } from "@/lib/filtre-de-recherche"
import type { IndexableProduct } from "@/lib/index-projection"
import type {
  ReponseDocuments,
  ReponseMoteur,
  RequeteMoteur,
} from "@/lib/moteur-recherche"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import { creerMoteurEnMemoire } from "@/test/moteur-recherche-memoire"

const SMARTPHONES = "cat-smartphones"
const AUDIO = "cat-audio"

function doc(
  id: string,
  overrides: Partial<IndexableProduct> = {}
): IndexableProduct {
  return {
    id,
    name: `Produit ${id}`,
    slug: `produit-${id}`,
    description: "",
    brand: "Marque",
    price: 100000,
    minPrice: 100000,
    totalStock: 5,
    images: [],
    categorySlug: SMARTPHONES,
    categoryName: "Smartphones",
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

const iphone = doc("iphone", {
  name: "iPhone 15 Pro",
  brand: "Apple",
  description: "Téléphone haut de gamme",
  specsText: "Puce A17 Pro Caméra 48 MP",
  variantNames: ["128 Go"],
  skus: ["IP15P-128"],
  minPrice: 1249900,
  priceBucket: "10000-plus",
  updatedAt: 1_000,
})

const samsung = doc("samsung", {
  name: "Samsung Galaxy S24",
  brand: "Samsung",
  minPrice: 699900,
  priceBucket: "5000-10000",
  updatedAt: 2_000,
})

const casque = doc("casque", {
  name: "Casque Sony WH-1000XM5",
  brand: "Sony",
  categorySlug: AUDIO,
  categoryName: "Audio & Hi-Fi",
  minPrice: 349900,
  priceBucket: "2500-5000",
  updatedAt: 3_000,
})

const ecran = doc("ecran", {
  name: "Écran 27 pouces 4K",
  brand: "LG",
  categorySlug: AUDIO,
  categoryName: "Audio & Hi-Fi",
  minPrice: 159900,
  priceBucket: "1000-2500",
  updatedAt: 4_000,
})

const clavier = doc("clavier", {
  name: "Clavier mécanique",
  brand: "Logitech",
  minPrice: 39900,
  priceBucket: "0-1000",
  updatedAt: 5_000,
})

const DOCUMENTS = [iphone, samsung, casque, ecran, clavier]

const moteur = creerMoteurEnMemoire(DOCUMENTS)

function reponseOk(reponse: ReponseMoteur): ReponseDocuments {
  if (reponse.statut !== "ok") {
    throw new Error("le moteur en mémoire ne répond jamais l'indisponible")
  }
  return reponse
}

async function chercher(requete: RequeteMoteur): Promise<ReponseDocuments> {
  return reponseOk(
    await moteur.chercher({ taille: DOCUMENTS.length, ...requete })
  )
}

function ids(reponse: ReponseDocuments): string[] {
  return reponse.documents.map((document) => document.id)
}

describe("creerMoteurEnMemoire — appartenance au texte", () => {
  it("trouve par contenance de jetons dans chacun des sept attributs cherchables", async () => {
    const attributs = [
      "name",
      "brand",
      "categoryName",
      "description",
      "specsText",
      "variantNames",
      "skus",
    ] as const
    const cas: Record<(typeof attributs)[number], [string, string[]]> = {
      name: ["Samsung", ["samsung"]],
      brand: ["logitech", ["clavier"]],
      categoryName: ["Audio", ["casque", "ecran"]],
      description: ["haut de gamme", ["iphone"]],
      specsText: ["A17 Pro", ["iphone"]],
      variantNames: ["128 Go", ["iphone"]],
      skus: ["IP15P", ["iphone"]],
    }

    for (const attribut of attributs) {
      const [requete, attendu] = cas[attribut]
      expect(ids(await chercher({ query: requete })), attribut).toEqual(attendu)
    }
  })

  it("replie la casse et les accents des deux côtés", async () => {
    expect(ids(await chercher({ query: "ECRAN 27 POUCES" }))).toEqual(["ecran"])
    expect(ids(await chercher({ query: "ecran 27 pouces 4k" }))).toEqual([
      "ecran",
    ])
    expect(ids(await chercher({ query: "ÉCRAN" }))).toEqual(["ecran"])
  })

  it("sature la requête : un jeton absent écarte le document, préfixes acceptés", async () => {
    expect(ids(await chercher({ query: "128 g" }))).toEqual(["iphone"])
    expect(ids(await chercher({ query: "128 Go 256" }))).toEqual([])
    expect(ids(await chercher({ query: "samsung iphone" }))).toEqual([])
  })

  it("ne rend rien pour une requête sans correspondance", async () => {
    expect(ids(await chercher({ query: "zzzqqqq" }))).toEqual([])
    expect((await chercher({ query: "zzzqqqq" })).total).toBe(0)
  })
})

describe("creerMoteurEnMemoire — Filtres de recherche", () => {
  it("filtre par marque, sur une marque comme sur une union", async () => {
    expect(
      ids(await chercher({ query: "", filtres: { brand: ["Sony"] } }))
    ).toEqual(["casque"])

    const union = await chercher({
      query: "",
      filtres: { brand: ["Sony", "LG"] },
    })
    expect(ids(union).sort()).toEqual(["casque", "ecran"])
    expect(union.total).toBe(2)

    const sansFiltre = await chercher({ query: "" })
    expect(ids(sansFiltre).sort()).toEqual([
      "casque",
      "clavier",
      "ecran",
      "iphone",
      "samsung",
    ])
  })

  it("filtre par catégorie", async () => {
    const resultat = await chercher({
      query: "",
      filtres: { categorySlug: AUDIO },
    })

    expect(ids(resultat).sort()).toEqual(["casque", "ecran"])
    expect(resultat.total).toBe(2)
  })

  it("filtre par Tranche de prix sur le minPrice cuit, bornes demi-ouvertes", async () => {
    const moinsDeMille = await chercher({
      query: "",
      filtres: { priceBucketId: "0-1000" },
    })
    expect(ids(moinsDeMille)).toEqual(["clavier"])

    const plusDeDixMille = await chercher({
      query: "",
      filtres: { priceBucketId: "10000-plus" },
    })
    expect(ids(plusDeDixMille)).toEqual(["iphone"])

    expect(
      (await chercher({ query: "", filtres: { priceBucketId: "inconnu" } }))
        .total
    ).toBe(5)
  })

  it("combine un texte, une marque et une Tranche de prix", async () => {
    const resultat = await chercher({
      query: "sony",
      filtres: { brand: ["Sony"], priceBucketId: "2500-5000" },
    })

    expect(ids(resultat)).toEqual(["casque"])
    expect(
      (
        await chercher({
          query: "",
          filtres: { brand: ["Sony", "LG"], categorySlug: AUDIO },
        })
      ).total
    ).toBe(2)
  })
})

describe("creerMoteurEnMemoire — tris", () => {
  it("trie par prix croissant et décroissant", async () => {
    const asc = await chercher({ query: "", tri: "prix-asc" })
    expect(ids(asc)).toEqual([
      "clavier",
      "ecran",
      "casque",
      "samsung",
      "iphone",
    ])

    const desc = await chercher({ query: "", tri: "prix-desc" })
    expect(ids(desc)).toEqual([
      "iphone",
      "samsung",
      "casque",
      "ecran",
      "clavier",
    ])
  })

  it("trie les nouveautés par updatedAt décroissant", async () => {
    const resultat = await chercher({ query: "", tri: "nouveautes" })

    expect(ids(resultat)).toEqual([
      "clavier",
      "ecran",
      "casque",
      "samsung",
      "iphone",
    ])
  })

  it("rend l'ordre d'entrée pour pertinence — la pertinence reste à Meili", async () => {
    const resultat = await chercher({ query: "", tri: "pertinence" })

    expect(ids(resultat)).toEqual(DOCUMENTS.map((document) => document.id))
  })
})

describe("creerMoteurEnMemoire — pagination et taille", () => {
  it("découpe la page demandée et rend le total complet", async () => {
    const premiere = await chercher({ query: "", page: 1, taille: 2 })
    expect(ids(premiere)).toEqual(["iphone", "samsung"])
    expect(premiere.total).toBe(5)

    const deuxieme = await chercher({ query: "", page: 2, taille: 2 })
    expect(ids(deuxieme)).toEqual(["casque", "ecran"])
    expect(deuxieme.total).toBe(5)

    const troisieme = await chercher({ query: "", page: 3, taille: 2 })
    expect(ids(troisieme)).toEqual(["clavier"])
    expect(troisieme.total).toBe(5)
  })

  it("tri et pagination se composent", async () => {
    const page = await chercher({
      query: "",
      tri: "prix-asc",
      page: 2,
      taille: 2,
    })

    expect(ids(page)).toEqual(["casque", "samsung"])
  })

  it("taille 0 ne mesure rien : aucun document, total zéro, répartitions complètes", async () => {
    const resultat = await chercher({
      query: "",
      taille: 0,
      facettes: ["brand"],
    })

    expect(resultat.documents).toEqual([])
    expect(resultat.total).toBe(0)
    expect(resultat.repartitions.brand).toEqual({
      Apple: 1,
      LG: 1,
      Logitech: 1,
      Samsung: 1,
      Sony: 1,
    })
  })

  it("taille borne la page sans toucher au total", async () => {
    const resultat = await chercher({
      query: "",
      taille: 6,
      facettes: ["brand"],
    })

    expect(resultat.documents).toHaveLength(5)
    expect(resultat.total).toBe(5)

    const borne = await chercher({ query: "", taille: 2 })
    expect(borne.documents).toHaveLength(2)
    expect(borne.total).toBe(5)
  })

  it("ne rend les répartitions que pour les facettes demandées", async () => {
    const resultat = await chercher({
      query: "",
      taille: 0,
      facettes: ["priceBucket"],
    })

    expect(resultat.repartitions.categorySlug).toBeUndefined()
    expect(resultat.repartitions.brand).toBeUndefined()
    const comptes = resultat.repartitions.priceBucket ?? {}
    expect(Object.keys(comptes).sort()).toEqual(
      PRICE_BUCKETS.map((bucket) => bucket.id).sort()
    )
    expect(Object.values(comptes)).toEqual([1, 1, 1, 1, 1])
  })
})

describe("creerMoteurEnMemoire — répartitions sous les filtres reçus", () => {
  it("une facette subit la marque et ignore sa propre clause", async () => {
    const filtres = { brand: ["Sony"], categorySlug: SMARTPHONES }

    const marques = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "marque"),
      taille: 0,
      facettes: ["brand"],
    })
    expect(marques.repartitions.brand).toEqual({
      Apple: 1,
      Logitech: 1,
      Samsung: 1,
    })

    const categories = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "categorie"),
      taille: 0,
      facettes: ["categorySlug"],
    })
    expect(categories.repartitions.categorySlug).toEqual({ [AUDIO]: 1 })
  })

  it("une facette subit aussi les deux autres filtres", async () => {
    const filtres = { categorySlug: AUDIO, priceBucketId: "2500-5000" }

    const tranches = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "prix"),
      taille: 0,
      facettes: ["priceBucket"],
    })
    expect(tranches.repartitions.priceBucket).toEqual({
      "1000-2500": 1,
      "2500-5000": 1,
    })
    const sansFiltres = await chercher({
      query: "",
      taille: 0,
      facettes: ["priceBucket"],
    })
    expect(sansFiltres.repartitions.priceBucket).toEqual({
      "0-1000": 1,
      "1000-2500": 1,
      "2500-5000": 1,
      "5000-10000": 1,
      "10000-plus": 1,
    })
  })

  it("sans filtre, chaque option de chaque facette reste comptable", async () => {
    const resultat = await chercher({
      query: "",
      taille: 0,
      facettes: ["brand", "categorySlug", "priceBucket"],
    })

    expect(resultat.repartitions.brand).toEqual({
      Apple: 1,
      LG: 1,
      Logitech: 1,
      Samsung: 1,
      Sony: 1,
    })
    expect(resultat.repartitions.categorySlug).toEqual({
      [AUDIO]: 2,
      [SMARTPHONES]: 3,
    })
    expect(resultat.repartitions.priceBucket).toEqual({
      "0-1000": 1,
      "1000-2500": 1,
      "2500-5000": 1,
      "5000-10000": 1,
      "10000-plus": 1,
    })
  })

  it("applique exactement les filtres reçus, sans retirer de clause", async () => {
    const filtres = { brand: ["Sony"] }

    const compteSousFiltreRetire = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "marque"),
      taille: 0,
      facettes: ["brand"],
    })
    const compteAvecFiltre = await chercher({
      query: "",
      filtres,
      taille: 0,
      facettes: ["brand"],
    })

    expect(compteSousFiltreRetire.repartitions.brand).toEqual({
      Apple: 1,
      LG: 1,
      Logitech: 1,
      Samsung: 1,
      Sony: 1,
    })
    expect(compteAvecFiltre.repartitions.brand).toEqual({ Sony: 1 })
  })
})
