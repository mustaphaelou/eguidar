import type { Meilisearch } from "meilisearch"
import { describe, expect, it } from "vitest"

import { chercherAvecMeili } from "@/lib/meili"
import { PRICE_BUCKETS } from "@/lib/price-buckets"

/**
 * Les faits de l'adaptateur Meili qui ne demandent ni moteur ni base : un
 * client de substitution enregistre les options qu'il reçoit. `lib/meili.test.ts`
 * reste la suite de gestion d'index (écriture) et n'est pas touché ici.
 */
interface AppelMeili {
  query: string
  options: Record<string, unknown>
}

function clientDeSubstitution(totalEstime = 0): {
  client: Meilisearch
  appels: AppelMeili[]
} {
  const appels: AppelMeili[] = []
  const client = {
    index: () => ({
      search: (query: string, options: Record<string, unknown>) => {
        appels.push({ query, options })
        return Promise.resolve({
          hits: [],
          estimatedTotalHits: totalEstime,
          facetDistribution: {},
        })
      },
    }),
  }
  return { client: client as unknown as Meilisearch, appels }
}

function clientQuiRejette(): Meilisearch {
  return {
    index: () => ({
      search: () => Promise.reject(new Error("moteur injoignable")),
    }),
  } as unknown as Meilisearch
}

const ATTRIBUTS_PRODUIT = [
  "id",
  "name",
  "slug",
  "brand",
  "images",
  "minPrice",
  "totalStock",
  "freeShipping",
]

describe("chercherAvecMeili — traduction de la page", () => {
  it("demande la projection produit complète pour chaque requête de page", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "casque",
      taille: 6,
      facettes: ["categorySlug"],
    })
    await chercherAvecMeili(client, {
      query: "",
      filtres: {},
      tri: "pertinence",
      page: 1,
      taille: 24,
    })

    const requetesDePage = appels.filter(
      ({ options }) => typeof options.limit === "number" && options.limit > 0
    )
    expect(requetesDePage).toHaveLength(2)
    expect(
      requetesDePage.map(({ options }) => options.attributesToRetrieve)
    ).toEqual([ATTRIBUTS_PRODUIT, ATTRIBUTS_PRODUIT])
  })

  it("propage l'estimation du moteur comme total de la page", async () => {
    const { client } = clientDeSubstitution(37)

    const reponse = await chercherAvecMeili(client, {
      query: "casque",
      taille: 24,
    })

    if (reponse.statut !== "ok") {
      throw new Error("le moteur de substitution doit répondre ok")
    }
    expect(reponse.total).toBe(37)
  })

  it("exclut les descriptions pour une requête courte", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "TV",
      taille: 24,
      facettes: ["categorySlug"],
    })

    const expected = [
      "name",
      "brand",
      "categoryName",
      "specsText",
      "variantNames",
      "skus",
    ]
    expect(appels).toHaveLength(2)
    expect(appels.map(({ options }) => options.attributesToSearchOn)).toEqual([
      expected,
      expected,
    ])
  })

  it("conserve tous les champs pour une requête longue", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, { query: "téléviseur", taille: 24 })

    expect(appels[0].options.attributesToSearchOn).toBeUndefined()
  })

  /**
   * La stratégie de correspondance est le seul moyen de dire au moteur
   * qu'exiger chaque terme est une règle de la Recherche, et non le défaut du
   * moteur. Elle est écrite sur *chaque* requête — la page comme les requêtes
   * de facette, sans quoi les options de filtre compteraient sur une requête
   * plus large que celle qui rend les résultats.
   */
  it("exige de la stratégie que chaque terme soit trouvé, page et facettes", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "casque sony wh",
      taille: 24,
      facettes: ["brand", "categorySlug"],
    })

    expect(appels.map(({ options }) => options.matchingStrategy)).toEqual([
      "all",
      "all",
      "all",
    ])
  })

  it("construit les clauses de marque, de catégorie et de prix", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, { query: "casque", taille: 24 })
    await chercherAvecMeili(client, {
      query: "casque",
      filtres: {
        brand: ["Sony", "LG"],
        categorySlug: "audio-hifi",
        priceBucketId: "2500-5000",
      },
      taille: 24,
    })

    expect(appels[0].options.filter).toBeUndefined()
    expect(appels[1].options.filter).toBe(
      'brand IN ["Sony", "LG"] AND categorySlug = "audio-hifi" AND (minPrice >= 250000 AND minPrice < 500000)'
    )
  })

  it("échappe les guillemets et les antislashs des valeurs", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "casque",
      filtres: {
        brand: ['Sony "Ultra"', "A\\B"],
        categorySlug: 'audio "hifi"',
      },
      taille: 24,
    })

    expect(appels[0].options.filter).toBe(
      'brand IN ["Sony \\"Ultra\\"", "A\\\\B"] AND categorySlug = "audio \\"hifi\\""'
    )
  })

  it("ignore une Tranche de prix inconnue sans perdre les autres filtres", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "casque",
      filtres: { brand: ["Sony"], priceBucketId: "inconnu" },
      taille: 24,
    })

    expect(appels[0].options.filter).toBe('brand IN ["Sony"]')
  })

  it.each(PRICE_BUCKETS)(
    "traduit la Tranche de prix $id en syntaxe Meili",
    async (bucket) => {
      const { client, appels } = clientDeSubstitution()

      await chercherAvecMeili(client, {
        query: "casque",
        filtres: { priceBucketId: bucket.id },
        taille: 24,
      })

      const attendu =
        bucket.maxCents === null
          ? `minPrice >= ${bucket.minCents}`
          : `minPrice >= ${bucket.minCents} AND minPrice < ${bucket.maxCents}`
      expect(appels[0].options.filter).toBe(`(${attendu})`)
    }
  )
})

describe("chercherAvecMeili — tri et requêtes de facette", () => {
  it.each([
    ["pertinence", undefined],
    ["prix-asc", ["minPrice:asc"]],
    ["prix-desc", ["minPrice:desc"]],
    ["nouveautes", ["updatedAt:desc"]],
  ] as const)(
    "mappe le tri %s vers les options Meili",
    async (tri, attendu) => {
      const { client, appels } = clientDeSubstitution()

      await chercherAvecMeili(client, { query: "casque", tri, taille: 24 })

      expect(appels[0].options.sort).toEqual(attendu)
    }
  )

  it("demande les répartitions de chaque facette avec une requête sans page", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "casque",
      filtres: {
        brand: ["Sony"],
        categorySlug: "audio-hifi",
        priceBucketId: "2500-5000",
      },
      taille: 0,
      facettes: ["brand", "priceBucket"],
    })

    expect(appels).toHaveLength(2)
    expect(appels.map(({ options }) => options.facets)).toEqual([
      ["brand"],
      ["priceBucket"],
    ])
    expect(appels.map(({ options }) => options.limit)).toEqual([0, 0])
    expect(appels[0].options.filter).toBe(
      'brand IN ["Sony"] AND categorySlug = "audio-hifi" AND (minPrice >= 250000 AND minPrice < 500000)'
    )
    expect(appels[1].options.filter).toBe(
      'brand IN ["Sony"] AND categorySlug = "audio-hifi" AND (minPrice >= 250000 AND minPrice < 500000)'
    )
  })
})

describe("chercherAvecMeili — indisponibilité", () => {
  it("répond indisponible quand le client est absent", async () => {
    await expect(
      chercherAvecMeili(null, { query: "casque", taille: 24 })
    ).resolves.toEqual({ statut: "indisponible" })
  })

  it("convertit le rejet du moteur en réponse indisponible", async () => {
    await expect(
      chercherAvecMeili(clientQuiRejette(), { query: "casque", taille: 24 })
    ).resolves.toEqual({ statut: "indisponible" })
  })
})
