import { describe, expect, it } from "vitest"

import type { IndexableProduct } from "@/lib/index-projection"
import { retirerFacette } from "@/lib/moteur-recherche"
import type {
  ReponseDocuments,
  ReponseMoteur,
  RequeteMoteur,
} from "@/lib/moteur-recherche"
import { PRICE_BUCKETS } from "@/lib/price-buckets"
import { creerMoteurEnMemoire } from "@/test/moteur-recherche-memoire"

/**
 * Le contrat du Moteur de recherche en mémoire — la suite qui épingle le
 * double de test lui-même, sans base et sans Meili.
 *
 * `lib/use-cases/search-memoire.test.ts` éprouve l'orchestration de la
 * Recherche à travers cette couture ; ici on fige ce que le moteur promet :
 * l'appartenance au texte par jetons repliés, les trois Filtres de
 * recherche, les quatre tris, la pagination et les répartitions calculées
 * sous les filtres reçus — la règle d'ADR-0016 est retirée au-dessus de la
 * couture, par `searchProducts`. Ce qui reste à Meili — tolérance aux
 * fautes, classement par pertinence, localisation, et la stratégie de
 * correspondance qui exige chaque terme — n'est pas éprouvé ici.
 *
 * Les documents sont construits à la main (la forme est
 * `IndexableProduct`, `lib/index-projection.ts`) : le moteur lit leurs
 * métriques déjà cuites (`minPrice`, `totalStock`, `priceBucket`) sans
 * jamais les recalculer (ADR-0013, ADR-0022).
 */

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

/**
 * Le moteur en mémoire ne répond jamais l'indisponible : ce rétrécissement
 * est l'assertion que chaque cas fait de toute façon avant de lire la
 * réponse (`statut` est le discriminant de la couture, #367).
 */
function reponseOk(reponse: ReponseMoteur): ReponseDocuments {
  if (reponse.statut !== "ok") {
    throw new Error("le moteur en mémoire ne répond jamais l'indisponible")
  }
  return reponse
}

/**
 * `taille` par défaut à la taille du Catalogue : au-dessus de la couture,
 * l'orchestration en envoie toujours une (`SEARCH_PAGE_SIZE`), tandis que
 * `taille: 0` est la requête de décompte — sans quoi le moteur ne rend
 * aucun document.
 */
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

  /**
   * La règle est celle du moteur en mémoire, et elle n'appartient qu'à lui : il
   * sature la requête — un jeton absent écarte le document — parce qu'il
   * compare des jetons, ce qui est la définition de sa fonction.
   *
   * Ce test ne dit donc plus ce que la Recherche promet au Visiteur. « Chaque
   * terme de la requête doit être trouvé » est la sémantique de Meilisearch,
   * qu'un moteur qui relâche ne tient pas, et elle se mesure sur un moteur
   * vivant : `lib/meili-correspondance.test.ts`. La redire ici serait une
   * preuve sans moteur sous elle.
   */
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
    // Le tri de la suite, jamais l'ordre d'entrée du moteur.
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

    // `iphone` porte `minPrice: 1249900` sans que son `priceBucket` soit
    // recalculé : la borne basse est inclusive, la borne haute exclusive.
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
    // L'ADR-0023 le documente : `pertinence` n'imite pas le classement de
    // Meili, il garde l'ordre des documents fournis. C'est cette promesse
    // — et rien d'autre — que la pagination de l'orchestration exploite.
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

    // Le total est la mesure de la requête de page : une requête de décompte
    // ne mesure rien et répond zéro, comme l'adaptateur Meili.
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
    // C'est le fait que `searchSuggestions` exploite : une taille de six
    // plafonne les documents rendus, jamais le total ni les répartitions.
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
  // ADR-0016 vit au-dessus de la couture : c'est `searchProducts` qui retire
  // la clause de la facette comptée avant d'appeler un moteur, et un moteur
  // applique exactement les filtres qu'il reçoit. Cette suite passe donc les
  // filtres déjà retirés ; `lib/use-cases/search-memoire.test.ts` éprouve la
  // règle entière, sous l'orchestration.
  it("une facette subit la marque et ignore sa propre clause", async () => {
    // Deux filtres seulement, l'un sur la marque et l'autre sur la catégorie :
    // chaque décompte est demandé sous les filtres dont sa propre clause a été
    // retirée, et subit donc celle de l'autre.
    const filtres = { brand: ["Sony"], categorySlug: SMARTPHONES }

    // La marque ignore son propre filtre (les cinq marques restent
    // comptables) et subit la catégorie : les trois produits Smartphones.
    const marques = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "brand"),
      taille: 0,
      facettes: ["brand"],
    })
    expect(marques.repartitions.brand).toEqual({
      Apple: 1,
      Logitech: 1,
      Samsung: 1,
    })

    // La catégorie ignore son propre filtre (les deux catégories restent
    // comptables) et subit la marque : le seul produit Sony.
    const categories = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "categorySlug"),
      taille: 0,
      facettes: ["categorySlug"],
    })
    expect(categories.repartitions.categorySlug).toEqual({ [AUDIO]: 1 })
  })

  it("une facette subit aussi les deux autres filtres", async () => {
    const filtres = { categorySlug: AUDIO, priceBucketId: "2500-5000" }

    // La Tranche de prix ignore sa propre clause : sous la catégorie Audio
    // sans filtre de tranche, les deux tranches des produits Audio restent
    // comptables — et non la seule tranche choisie.
    const tranches = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "priceBucket"),
      taille: 0,
      facettes: ["priceBucket"],
    })
    expect(tranches.repartitions.priceBucket).toEqual({
      "1000-2500": 1,
      "2500-5000": 1,
    })
    // Contre-épreuve de la même règle : sans les autres filtres, les cinq
    // tranches du Catalogue sont comptables.
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

    // Le retrait est le fait de l'orchestration, jamais du moteur : la même
    // requête sans retrait ne compte que la marque filtrée.
    const compteSousFiltreRetire = await chercher({
      query: "",
      filtres: retirerFacette(filtres, "brand"),
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
