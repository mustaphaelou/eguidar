import { randomUUID } from "node:crypto"

import type { Meilisearch, Settings } from "meilisearch"
import { beforeAll, describe, expect, it } from "vitest"

import {
  ensureProductsIndex,
  getMeiliSearch,
  PRODUCTS_INDEX,
} from "@/lib/meili"

const meili = getMeiliSearch()
const runId = randomUUID()

const TASK_WAIT_TIMEOUT = 60_000

const REGLAGES_EPINGLES = [
  {
    nom: "la tolérance aux fautes",
    cle: "typoTolerance",
    valeur: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
      disableOnWords: [],
      disableOnAttributes: [],
      disableOnNumbers: false,
    },
  },
  {
    nom: "la fenêtre de résultats",
    cle: "pagination",
    valeur: { maxTotalHits: 1000 },
  },
  {
    nom: "l'ordre et le plafond des valeurs de facette",
    cle: "faceting",
    valeur: { maxValuesPerFacet: 100, sortFacetValuesBy: { "*": "alpha" } },
  },
] as const satisfies readonly {
  nom: string
  cle: keyof Settings
  valeur: unknown
}[]

async function reglagesRapportes(
  client: Meilisearch,
  indexUid: string
): Promise<Settings> {
  return client.index(indexUid).getSettings()
}

async function reglagesRecus(
  client: Meilisearch,
  indexUid: string
): Promise<Settings> {
  const { results } = await client.tasks.getTasks({
    indexUids: [indexUid],
    types: ["settingsUpdate"],
    limit: 1,
  })
  const [derniere] = results
  if (!derniere) {
    throw new Error(`l'index ${indexUid} n'a jamais reçu de réglages`)
  }
  const terminee = await client.tasks.waitForTask(derniere.uid, {
    timeout: TASK_WAIT_TIMEOUT,
  })
  return terminee.details ?? {}
}

describe.runIf(!!meili)("Les réglages de l'index des Produits", () => {
  const client = meili!

  beforeAll(async () => {
    await ensureProductsIndex(client)
    await reglagesRecus(client, PRODUCTS_INDEX)
  })

  it.each(REGLAGES_EPINGLES)("le moteur rapporte $nom", async (reglage) => {
    const rapportes = await reglagesRapportes(client, PRODUCTS_INDEX)

    expect(rapportes[reglage.cle]).toEqual(reglage.valeur)
  })

  it.each(REGLAGES_EPINGLES)(
    "le propriétaire écrit $nom, plutôt que de laisser le défaut",
    async (reglage) => {
      const recus = await reglagesRecus(client, PRODUCTS_INDEX)

      expect(recus[reglage.cle]).toEqual(reglage.valeur)
    }
  )

  it("le propriétaire n'écrit rien d'autre", async () => {
    const recus = await reglagesRecus(client, PRODUCTS_INDEX)

    expect(recus).toEqual({
      searchableAttributes: expect.any(Array),
      filterableAttributes: [
        "brand",
        "categorySlug",
        "minPrice",
        "priceBucket",
      ],
      sortableAttributes: ["minPrice", "updatedAt"],
      localizedAttributes: expect.any(Array),
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
        disableOnWords: [],
        disableOnAttributes: [],
        disableOnNumbers: false,
      },
      pagination: { maxTotalHits: 1000 },
      faceting: { maxValuesPerFacet: 100, sortFacetValuesBy: { "*": "alpha" } },
    })
  })

  it(
    "les deux lectures voient la dérive qu'un index jetable fait accepter",
    { timeout: TASK_WAIT_TIMEOUT },
    async () => {
      const uid = `reglages-sonde-${runId}`
      try {
        const creation = await client.createIndex(uid, { primaryKey: "id" })
        await client.tasks.waitForTask(creation.taskUid, {
          timeout: TASK_WAIT_TIMEOUT,
        })
        const ecriture = await client.index(uid).updateSettings({
          typoTolerance: { enabled: false },
          pagination: { maxTotalHits: 42 },
          faceting: { maxValuesPerFacet: 3 },
        })
        await client.tasks.waitForTask(ecriture.taskUid, {
          timeout: TASK_WAIT_TIMEOUT,
        })

        const rapportes = await reglagesRapportes(client, uid)
        expect(rapportes.typoTolerance).toMatchObject({ enabled: false })
        expect(rapportes.pagination).toEqual({ maxTotalHits: 42 })
        expect(rapportes.faceting).toEqual({
          maxValuesPerFacet: 3,
          sortFacetValuesBy: { "*": "alpha" },
        })

        const recus = await reglagesRecus(client, uid)
        expect(recus.typoTolerance).toEqual({ enabled: false })
        expect(recus.pagination).toEqual({ maxTotalHits: 42 })
        expect(recus.faceting).toEqual({ maxValuesPerFacet: 3 })
      } finally {
        const suppression = await client.deleteIndex(uid)
        await client.tasks.waitForTask(suppression.taskUid, {
          timeout: TASK_WAIT_TIMEOUT,
        })
      }
    }
  )
})
