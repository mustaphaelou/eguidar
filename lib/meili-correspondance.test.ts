import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { IndexableProduct } from "@/lib/index-projection"
import {
  chercherAvecMeili,
  ensureProductsIndex,
  getMeiliSearch,
  PRODUCTS_INDEX,
} from "@/lib/meili"
import type { ReponseDocuments } from "@/lib/moteur-recherche"

const meili = getMeiliSearch()
const runId = randomUUID().slice(0, 8)
const CATEGORIE = `correspondance-${runId}`

const TASK_WAIT_TIMEOUT = 60_000

function doc(id: string, name: string): IndexableProduct {
  return {
    id,
    name,
    slug: `correspondance-${runId}-${id}`,
    description: "",
    brand: "Marque",
    price: 100000,
    minPrice: 100000,
    totalStock: 5,
    images: [],
    categorySlug: CATEGORIE,
    categoryName: "Sonde de correspondance",
    specsText: "",
    variantNames: [],
    skus: [],
    isFeatured: false,
    freeShipping: false,
    priceBucket: "1000-2500",
    updatedAt: 0,
  }
}

const TROIS_TERMES = doc(
  `trois-termes-${runId}`,
  "Écran Zibeline Trinitrine Souffle Zorblin"
)

const DEUX_TERMES = doc(`deux-termes-${runId}`, "Zibeline Trinitrine Zorlick")

const FIXTURES = [TROIS_TERMES, DEUX_TERMES]

const REQUETE_TROIS_TERMES = "Zibeline Trinitrine Souffle"

const REQUETE_AVEC_FAUTE = "Trnitrine Zibeline Souffla"

describe.runIf(!!meili)(
  "La correspondance de la Recherche, moteur vivant",
  () => {
    const client = meili!

    async function chercher(query: string): Promise<ReponseDocuments> {
      const reponse = await chercherAvecMeili(client, { query, taille: 24 })
      if (reponse.statut !== "ok") {
        throw new Error("le moteur de la Recherche est indisponible")
      }
      return reponse
    }

    function ids(reponse: ReponseDocuments): (string | number)[] {
      return reponse.documents.map(({ id }) => id)
    }

    beforeAll(async () => {
      await ensureProductsIndex(client)
      const task = await client.index(PRODUCTS_INDEX).addDocuments(FIXTURES)
      await client.tasks.waitForTask(task.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })
    })

    afterAll(async () => {
      const task = await client
        .index(PRODUCTS_INDEX)
        .deleteDocuments({ filter: `categorySlug = "${CATEGORIE}"` })
      await client.tasks.waitForTask(task.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })
    })

    it("atteint chaque document par le mot qui n'est qu'à lui", async () => {
      expect(ids(await chercher("Zorblin"))).toContain(TROIS_TERMES.id)
      expect(ids(await chercher("Zorlick"))).toContain(DEUX_TERMES.id)
    })

    it("exige les trois termes, et écarte le document qui n'en a que deux", async () => {
      const trouves = ids(await chercher(REQUETE_TROIS_TERMES))

      expect(trouves).toContain(TROIS_TERMES.id)
      expect(trouves).not.toContain(DEUX_TERMES.id)
    })

    it("l'adaptateur qui omet la stratégie rend le document à deux termes", async () => {
      const { hits } = await client
        .index(PRODUCTS_INDEX)
        .search(REQUETE_TROIS_TERMES, {
          limit: 24,
        })

      expect(hits.map(({ id }) => id)).toContain(DEUX_TERMES.id)
    })

    it("trouve le document malgré la faute de frappe", async () => {
      expect(ids(await chercher(REQUETE_AVEC_FAUTE))).toContain(TROIS_TERMES.id)
    })

    it("trouve le document accentué, quelle que soit la casse", async () => {
      expect(
        ids(await chercher("ÉCRAN ZIBELINE TRINITRINE SOUFFLE"))
      ).toContain(TROIS_TERMES.id)
      expect(
        ids(await chercher("ECRAN ZIBELINE TRINITRINE SOUFFLE"))
      ).toContain(TROIS_TERMES.id)
    })
  }
)
