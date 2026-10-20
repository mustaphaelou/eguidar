import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  ensureProductsIndex,
  getMeiliSearch,
  moteurMeili,
  PRODUCTS_INDEX,
} from "@/lib/meili"
import {
  exigerCinqCategoriesDistinctes,
  exigerCategoriesSemees,
  exigerCategoriesSuggestion,
  jeuSuggestionCategories,
} from "@/test/suggestion-categories-recherche"

const meili = getMeiliSearch()

const TASK_WAIT_TIMEOUT = 60_000

const suggestionCategories = jeuSuggestionCategories(randomUUID().slice(0, 8))
const moteur = moteurMeili()

describe.runIf(!!meili)(
  "les catégories que la Recherche propose, sur le moteur vivant",
  () => {
    const client = meili!

    beforeAll(async () => {
      await ensureProductsIndex(client)
      const ajout = await client
        .index(PRODUCTS_INDEX)
        .addDocuments(suggestionCategories.documents)
      await client.tasks.waitForTask(ajout.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })
    }, TASK_WAIT_TIMEOUT)

    afterAll(async () => {
      const suppression = await client.index(PRODUCTS_INDEX).deleteDocuments({
        filter: `categorySlug STARTS WITH "suggestion-categories-${suggestionCategories.id}"`,
      })
      await client.tasks.waitForTask(suppression.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })
    }, TASK_WAIT_TIMEOUT)

    it("les sept catégories ont atterri, avec les comptes qu'elles déclarent", async () => {
      await exigerCategoriesSemees(suggestionCategories, moteur)
    })

    it("ouvre sur les catégories que la requête concerne le plus, plafond compris", async () => {
      const suggestions = await exigerCategoriesSuggestion(
        suggestionCategories,
        moteur
      )

      await exigerCinqCategoriesDistinctes(suggestions)
      expect(suggestions.products).toHaveLength(6)
    })
  }
)
