import { describe, expect, it } from "vitest"

import type { Meilisearch } from "meilisearch"

import { chercherAvecMeili } from "@/lib/meili"

/**
 * Les faits de l'adaptateur Meili qui ne demandent ni moteur ni base : un
 * client de substitution enregistre les options qu'il reçoit. `lib/meili.test.ts`
 * reste la suite de gestion d'index (écriture) et n'est pas touché ici.
 */
interface AppelMeili {
  query: string
  options: Record<string, unknown>
}

function clientDeSubstitution(): {
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
          estimatedTotalHits: 0,
          facetDistribution: {},
        })
      },
    }),
  }
  return { client: client as unknown as Meilisearch, appels }
}

const CARTES_PRODUIT = [
  "id",
  "name",
  "slug",
  "brand",
  "images",
  "minPrice",
  "totalStock",
  "freeShipping",
]

const CARTES_SUGGESTION = [
  "id",
  "name",
  "slug",
  "brand",
  "images",
  "minPrice",
]

describe("chercherAvecMeili — projection de page", () => {
  it("projette la requête de searchSuggestions en version légère", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "casque",
      taille: 6,
      facettes: ["categorySlug"],
    })

    expect(appels[0].options.attributesToRetrieve).toEqual(CARTES_SUGGESTION)
  })

  it("projette en entier toute autre page", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, { query: "casque", taille: 24 })

    expect(appels[0].options.attributesToRetrieve).toEqual(CARTES_PRODUIT)
  })

  it("projette en entier la page du catalogue, filtres et tri compris", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "",
      filtres: {},
      tri: "pertinence",
      page: 1,
      taille: 24,
    })

    expect(appels[0].options.attributesToRetrieve).toEqual(CARTES_PRODUIT)
  })
})

describe("chercherAvecMeili — les filtres reçus, tels quels", () => {
  it("applique exactement les filtres reçus, sans retirer de clause", async () => {
    const { client, appels } = clientDeSubstitution()

    await chercherAvecMeili(client, {
      query: "casque",
      filtres: { brand: ["Sony"], categorySlug: "audio-hifi" },
      taille: 0,
      facettes: ["brand"],
    })

    // ADR-0016 se règle au-dessus de la couture : la requête de décompte
    // arrive déjà sans la clause de sa facette, et l'adaptateur n'en retire
    // aucune — il applique la requête telle qu'il la reçoit.
    expect(appels).toHaveLength(1)
    expect(appels[0].options.filter).toBe(
      'brand IN ["Sony"] AND categorySlug = "audio-hifi"'
    )
    expect(appels[0].options.facets).toEqual(["brand"])
    expect(appels[0].options.limit).toBe(0)
  })
})
