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

/**
 * Les trois réglages que le Visiteur voit et que rien n'écrivait : la
 * tolérance aux fautes (un mot mal orthographié trouve son Produit), la
 * fenêtre de résultats — au-delà de ce plafond, une page rend zéro document —,
 * et l'ordre puis le plafond des valeurs de facette, qui sont les options de
 * filtre du panneau. Les valeurs sont celles que le moteur a rendues sur l'index
 * `products` avec la v1.52, recopiées ici en littéral.
 *
 * Les reprendre d'une constante exportée par `lib/meili.ts` ferait de cette
 * suite un miroir du code : elle passerait quelle que soit la valeur, et
 * n'épinglerait rien. Une valeur écrite en clair est au contraire un fait que
 * seul le moteur peut contredire.
 */
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

/**
 * Ce que le moteur **rapporte** : les valeurs effectives de l'index, défauts
 * du moteur compris. C'est la lecture qui tient la valeur, et la seule qui
 * voie une montée de version de Meilisearch changer un défaut.
 */
async function reglagesRapportes(
  client: Meilisearch,
  indexUid: string
): Promise<Settings> {
  return client.index(indexUid).getSettings()
}

/**
 * Ce que le moteur a **reçu**.
 *
 * `GET /indexes/<uid>/settings` ne peut pas dire si le dépôt a parlé : sur
 * l'index `products`, `typoTolerance`, `faceting` et `pagination` y revenaient
 * avec leur valeur par défaut alors que rien ne les écrivait — et un index neuf
 * sans le moindre réglage rend `{}`. Une lecture des valeurs effectives est donc
 * verte avant comme après l'écriture, et ne verrait jamais qu'un défaut a
 * changé de valeur.
 *
 * Ce qui dit si le dépôt a parlé est la tâche `settingsUpdate` que le moteur a
 * conservée : son `details` est la charge utile reçue, et elle ne portait que
 * les quatre attributs que `ensureProductsIndex` écrivait. C'est cette lecture
 * qui rend cette suite rouge sur l'index d'aujourd'hui et verte sur celui de
 * demain.
 */
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
    // `ensureProductsIndex` se contente d'enfiler la tâche ; la lecture des
    // réglages reçus la veut terminée.
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

  /**
   * Le propriétaire n'écrit rien d'autre que ces quatre attributs et ces trois
   * réglages — la charge utile est lue en entier, pas réglage par réglage.
   *
   * #531 affirmait ici l'absence de la stratégie de correspondance, pour que
   * le jour où quelqu'un l'ajouterait « en passant », la suite dise que c'est
   * un choix. Elle n'a jamais pu être écrite dans cette charge utile : chez
   * Meilisearch, la stratégie de correspondance n'est pas un réglage d'index.
   * Le moteur la refuse — `Unknown field 'matchingStrategy': expected one of
   * 'displayedAttributes', 'searchableAttributes', …` — et `GET /indexes/<uid>/settings`
   * ne la rend pas davantage : c'est un paramètre de requête, que le SDK
   * déclare dans `SearchParams` et nulle part dans `Settings`. Elle s'écrit
   * donc sur chaque recherche, dans `lib/meili.ts`, et
   * `lib/meili-correspondance.test.ts` en mesure la conséquence sur un moteur
   * vivant.
   *
   * Cette égalité est plus large que l'absence qu'elle remplace : un réglage
   * ajouté en passant, quel qu'il soit, la rend rouge.
   */
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

  /**
   * Le contrôle négatif des deux lectures. Un index jetable reçoit des valeurs
   * que le moteur accepte et qui s'écartent des trois épinglées : les deux
   * lectures doivent les rendre telles quelles. Sans lui, une lecture qui
   * rendrait toujours la valeur attendue passerait partout — c'est-à-dire une
   * suite dont aucune des trois lignes ne pourrait échouer.
   */
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
        // Le moteur complète ce qu'un index neuf laisse à son défaut : le
        // plafond écrit ne fait pas disparaître l'ordre qu'il n'a pas reçu.
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
