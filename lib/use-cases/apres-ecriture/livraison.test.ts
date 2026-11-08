import { describe, expect, it } from "vitest"

import {
  declarerApresEcriture,
  type ConsequenceLivraison,
  type PlanLivraison,
} from "@/lib/apres-ecriture"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import type { GestionnairesPour } from "./executeur"
import {
  executer,
  executerUne,
  type EffetsLivraison,
  type LecturesLivraison,
} from "./livraison"

const VILLE = "ville-951"
const LIVRAISON = "default"

interface CasDeLivraison {
  genre: string
  declarer: () => PlanLivraison
  entite: { type: "ville" | "livraison"; id: string }
  payload: { id: string }
}

const CAS: CasDeLivraison[] = [
  {
    genre: "ville.creee",
    declarer: () => declarerApresEcriture("ville.creee", { villeId: VILLE }),
    entite: { type: "ville", id: VILLE },
    payload: { id: VILLE },
  },
  {
    genre: "ville.modifiee",
    declarer: () => declarerApresEcriture("ville.modifiee", { villeId: VILLE }),
    entite: { type: "ville", id: VILLE },
    payload: { id: VILLE },
  },
  {
    genre: "ville.supprimee",
    declarer: () =>
      declarerApresEcriture("ville.supprimee", { villeId: VILLE }),
    entite: { type: "ville", id: VILLE },
    payload: { id: VILLE },
  },
  {
    genre: "livraison.reglee",
    declarer: () =>
      declarerApresEcriture("livraison.reglee", { livraisonId: LIVRAISON }),
    entite: { type: "livraison", id: LIVRAISON },
    payload: { id: LIVRAISON },
  },
]

function portEnregistreur(): { appels: unknown[][]; effets: EffetsLivraison } {
  const appels: unknown[][] = []
  return {
    appels,
    effets: {
      revalidateShipping: () => {
        appels.push([])
      },
    },
  }
}

describe("l'adaptateur Livraison", () => {
  it.each(CAS)(
    "déclare et exécute $genre : une conséquence, un appel de port, une ligne de journal",
    async ({ declarer, entite, payload }) => {
      const { appels, effets } = portEnregistreur()
      const journal = creerJournalEffetsMemoire()
      const plan = declarer()

      // Ces écritures ne déclarent aucun fait : aucun Événement, aucune
      // Exécution d'automatisation, aucun réessai possible.
      expect(plan.faits).toEqual([])
      expect(plan.consequences.map((candidate) => candidate.effet)).toEqual([
        "invalidation-cache",
      ])
      expect(plan.consequences).toHaveLength(1)
      expect(plan.consequences[0]).toMatchObject({
        effet: "invalidation-cache",
        durable: false,
        reparation: "TTL",
        entite,
        payload,
      })
      expect(plan.consequences[0]!.action).toBeUndefined()

      await executer(plan, effets, {}, journal)

      expect(appels).toHaveLength(plan.consequences.length)
      expect(journal.mesures).toHaveLength(plan.consequences.length)
      expect(journal.mesures[0]).toMatchObject({
        effet: "invalidation-cache",
        entite,
        resultat: "succes",
      })
      expect(
        journal.mesures.some((mesure) => mesure.resultat === "echec")
      ).toBe(false)
    }
  )

  it("journalise l'échec du port sans réessayer et sans défaire l'écriture", async () => {
    const appels: unknown[][] = []
    const panne = new Error("cache indisponible")
    const effets: EffetsLivraison = {
      revalidateShipping: () => {
        appels.push([])
        throw panne
      },
    }
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("ville.creee", { villeId: VILLE })

    await expect(executer(plan, effets, {}, journal)).resolves.toBeUndefined()

    expect(appels).toHaveLength(1)
    expect(journal.mesures).toHaveLength(1)
    expect(journal.mesures[0]).toMatchObject({
      effet: "invalidation-cache",
      entite: { type: "ville", id: VILLE },
      resultat: "echec",
      erreur: "cache indisponible",
    })
  })

  it("exécute une seule conséquence directement, sans journal, et laisse l'échec remonter", async () => {
    const { appels, effets } = portEnregistreur()
    const plan = declarerApresEcriture("livraison.reglee", {
      livraisonId: LIVRAISON,
    })
    const consequence = plan.consequences[0]!

    await executerUne(consequence, effets, {})

    expect(appels).toHaveLength(1)

    const panne = new Error("cache indisponible")
    await expect(
      executerUne(consequence, {
        revalidateShipping: () => {
          throw panne
        },
      })
    ).rejects.toBe(panne)
  })

  it("prouve au type que la carte est totale et sans gestionnaire superflu", () => {
    const complet = {
      "invalidation-cache": async () => {},
    }
    const total: GestionnairesPour<ConsequenceLivraison> = complet

    const partiel = {}
    // @ts-expect-error — un effet déclaré sans gestionnaire ne compile pas.
    const incomplet: GestionnairesPour<ConsequenceLivraison> = partiel

    const superflu: GestionnairesPour<ConsequenceLivraison> = {
      "invalidation-cache": async () => {},
      // @ts-expect-error — un gestionnaire que les genres n'émettent pas ne compile pas.
      reindexation: async () => {},
    }

    const lectures: LecturesLivraison = {}
    expect([total, incomplet, superflu, lectures]).toHaveLength(4)
  })
})
