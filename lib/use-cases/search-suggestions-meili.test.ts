import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
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

/**
 * Le même scénario que `lib/use-cases/search-memoire.test.ts`, rejoué contre le
 * moteur qui tourne en production.
 *
 * **Une suite distincte, pas un contrat.** ADR-0023 a refusé un contrat
 * partagé entre les deux moteurs : ils divergent réellement sur le classement
 * et sur la faute de frappe, et un contrat n'affirmerait que leur
 * intersection. Ce que les deux suites font ici est plus étroit : chacune
 * rejoue le même jeu et exige la même réponse écrite dans
 * `@/test/suggestion-categories-recherche`. Deux fichiers, deux travail
 * distincts — celui-ci indexe pour de vrai, interroge un moteur, et range ce
 * qu'il a indexé.
 *
 * **Ce que le moteur en mémoire ne peut pas voir, cette suite le voit.**
 * Meilisearch rend ses valeurs de facette dans l'ordre des slugs : c'est le
 * fait que `#531` a épinglé en littéral, et la raison pour laquelle
 * l'implémentation d'avant passait au vert. Le moteur en mémoire rend ses clés
 * dans l'ordre des Documents, ce qui n'a rien à voir — et c'est pourquoi le jeu
 * est émis à l'envers : les deux ordres rendus par les deux moteurs ne sont
 * ni le même, ni l'ordre attendu. Une exécution où les deux suites passent
 * ensemble dit que l'ordre des catégories vient des comptes.
 */
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
      await prisma.category.createMany({
        data: suggestionCategories.categories.map((category) => ({
          name: category.name,
          slug: category.slug,
        })),
        skipDuplicates: true,
      })
      const ajout = await client
        .index(PRODUCTS_INDEX)
        .addDocuments(suggestionCategories.documents)
      await client.tasks.waitForTask(ajout.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })
    }, TASK_WAIT_TIMEOUT)

    afterAll(async () => {
      // Le préfixe commun aux sept slugs : une seule tâche les retire tous, et
      // cette suite Meili est la seule dont les slugs ne sont cités qu'entre
      // guillemets dans un filtre.
      const suppression = await client.index(PRODUCTS_INDEX).deleteDocuments({
        filter: `categorySlug STARTS WITH "suggestion-categories-${suggestionCategories.id}"`,
      })
      await client.tasks.waitForTask(suppression.taskUid, {
        timeout: TASK_WAIT_TIMEOUT,
      })
      await prisma.category.deleteMany({
        where: {
          slug: { in: suggestionCategories.categories.map((c) => c.slug) },
        },
      })
      await prisma.$disconnect()
    }, TASK_WAIT_TIMEOUT)

    it("les sept catégories ont atterri, avec les comptes qu'elles déclarent", async () => {
      // Le témoin d'atterrissage, et il vient **avant** toute affirmation sur
      // ce qui revient. Un jeu non indexé ne rend aucune répartition : les
      // attentes de la suite suivante passeraient au vert sur le vide, et le
      // moteur serait réputé conforme sans avoir jamais rien reçu.
      await exigerCategoriesSemees(suggestionCategories, moteur)
    })

    it("ouvre sur les catégories que la requête concerne le plus, plafond compris", async () => {
      // L'attente est celle du moteur en mémoire, au caractère près. C'est ce
      // qui en fait une propriété de la Recherche et non d'un adaptateur : le
      // même jeu, la même réponse écrite, deux moteurs qui rendent leurs clés
      // dans deux ordres différents.
      const suggestions = await exigerCategoriesSuggestion(
        suggestionCategories,
        moteur
      )

      await exigerCinqCategoriesDistinctes(suggestions)
      // Le nombre de suggestions de produit ne bouge pas : ce sont les
      // catégories qui se réordonnent, pas la longueur des deux listes.
      expect(suggestions.products).toHaveLength(6)
    })
  }
)
