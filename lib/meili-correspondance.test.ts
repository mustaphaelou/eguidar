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

/**
 * Ce que la Recherche promet au Visiteur, et que seul un moteur vivant peut
 * dire : *chaque terme de la requête est trouvé dans le document*, faute de
 * frappe permise. Un moteur qui relâche — son défaut `last`, qui retire les
 * mots de la fin du côté jusqu'à remplir une page — ne tient pas cette
 * promesse, et le disait sans le dire. C'est cette mesure qui l'a fait taire.
 *
 * La sémantique est ici, pas dans `test/moteur-recherche-memoire.test.ts` : le
 * moteur en mémoire sature la requête *par construction*, ce qui n'est pas la
 * preuve d'un moteur mais la définition d'une fonction. Ce que cette suite
 * éprouve, c'est l'adaptateur de production et le moteur qu'il interroge.
 *
 * Les documents sont écrits dans l'index `products` puis retirés. Les termes de
 * la requête sont des mots sans signification, qu'aucun Produit du Catalogue ne
 * peut porter, et les assertions sont des appartenances plutôt que des
 * égalités : un Catalogue garni, ou les fixtures d'une suite voisine, peuvent
 * ajouter des documents sans faire mentir ces lignes.
 */

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

/**
 * Le document complet : il porte les trois termes de la requête, plus un mot
 * qui n'est qu'à lui — `Zorblin` — pour l'atteindre seul lorsqu'une assertion
 * doit prouver que le corpus a bien atterri.
 */
const TROIS_TERMES = doc(
  `trois-termes-${runId}`,
  "Écran Zibeline Trinitrine Souffle Zorblin"
)

/**
 * Le document partiel : deux des trois termes, et son propre mot — `Zorlick`.
 * C'est lui que la stratégie de correspondance doit écarter, et c'est sa
 * présence dans l'index qui rend l'écart visible.
 */
const DEUX_TERMES = doc(`deux-termes-${runId}`, "Zibeline Trinitrine Zorlick")

const FIXTURES = [TROIS_TERMES, DEUX_TERMES]

/** Les trois termes, dans l'ordre où le Visiteur les tape. */
const REQUETE_TROIS_TERMES = "Zibeline Trinitrine Souffle"

/**
 * Une faute intérieure sur chacun des deux termes les plus longs : un `i`
 * manque à `Trinitrine`, un `e` cède la place à un `a` dans `Souffle`. Ni
 * l'un ni l'autre n'est un préfixe, donc aucune troncature de fin ne peut
 * expliquer à la place du moteur que le document reste trouvé.
 */
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

    /**
     * Les fixtures d'abord. Une suite dont le corpus n'a pas atterri ne prouve
     * rien : un « rien ne correspond » y serait vert pour la mauvaise raison.
     * Chacune est atteinte par le mot qui n'est qu'à elle ; ces requêtes sont
     * monosyllabiques, donc la stratégie de correspondance — l'objet de la
     * mesure — n'y entre pas.
     */
    it("atteint chaque document par le mot qui n'est qu'à lui", async () => {
      expect(ids(await chercher("Zorblin"))).toContain(TROIS_TERMES.id)
      expect(ids(await chercher("Zorlick"))).toContain(DEUX_TERMES.id)
    })

    it("exige les trois termes, et écarte le document qui n'en a que deux", async () => {
      const trouves = ids(await chercher(REQUETE_TROIS_TERMES))

      expect(trouves).toContain(TROIS_TERMES.id)
      expect(trouves).not.toContain(DEUX_TERMES.id)
    })

    /**
     * Le contrôle négatif : la même question posée au moteur *sans* la stratégie.
     * C'est ce que la Recherche faisait avant ce ticket, et ce qu'elle ferait
     * encore demain si l'adaptateur se taisait. Le document à deux termes
     * revient — donc l'assertion d'au-dessus peut échouer, et c'est bien le
     * paramètre qui fait la différence, pas la forme du corpus.
     */
    it("l'adaptateur qui omet la stratégie rend le document à deux termes", async () => {
      const { hits } = await client
        .index(PRODUCTS_INDEX)
        .search(REQUETE_TROIS_TERMES, {
          limit: 24,
        })

      expect(hits.map(({ id }) => id)).toContain(DEUX_TERMES.id)
    })

    /**
     * Exiger chaque terme ne doit pas éteindre la tolérance aux fautes : c'est
     * là que le rétrécissement aurait pu se payer en faux négatifs. Toujours
     * dans une requête de trois termes — c'est là que la stratégie est en jeu.
     */
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
