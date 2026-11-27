import { describe, expect, it } from "vitest"

import {
  declarerApresEcriture,
  type ConsequenceAnnonce,
  type PlanAnnonce,
} from "@/lib/apres-ecriture"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import {
  executer,
  executerUne,
  type EffetsAnnonce,
  type LecturesAnnonce,
} from "./annonce"
import type { GestionnairesPour } from "./executeur"

const ANNONCE = "default"

function portEnregistreur(): { appels: unknown[][]; effets: EffetsAnnonce } {
  const appels: unknown[][] = []
  return {
    appels,
    effets: {
      invalidateAnnonce: async () => {
        appels.push([])
      },
    },
  }
}

describe("l'adaptateur Annonce", () => {
  it("déclare et exécute annonce.reglee : zéro Fait, une conséquence non durable, un appel de port, une ligne de journal", async () => {
    const { appels, effets } = portEnregistreur()
    const journal = creerJournalEffetsMemoire()
    const plan: PlanAnnonce = declarerApresEcriture("annonce.reglee", {
      annonceId: ANNONCE,
    })

    expect(plan.faits).toEqual([])
    expect(plan.consequences.map((candidate) => candidate.effet)).toEqual([
      "invalidation-cache",
    ])
    expect(plan.consequences).toHaveLength(1)
    expect(plan.consequences[0]).toMatchObject({
      effet: "invalidation-cache",
      durable: false,
      reparation: "TTL",
      entite: { type: "annonce", id: ANNONCE },
      payload: { id: ANNONCE },
    })
    expect(plan.consequences[0]!.action).toBeUndefined()

    await executer(plan, effets, {}, journal)

    expect(appels).toHaveLength(1)
    expect(journal.mesures).toHaveLength(1)
    expect(journal.mesures[0]).toMatchObject({
      effet: "invalidation-cache",
      entite: { type: "annonce", id: ANNONCE },
      resultat: "succes",
    })
    expect(journal.mesures.some((mesure) => mesure.resultat === "echec")).toBe(
      false
    )
  })

  it("utilise l'identifiant default quand aucun annonceId n'est transmis", () => {
    const plan = declarerApresEcriture("annonce.reglee", {})

    expect(plan.consequences[0]).toMatchObject({
      entite: { type: "annonce", id: "default" },
      payload: { id: "default" },
    })
  })

  it("journalise l'échec du port sans réessayer et sans défaire l'écriture", async () => {
    const appels: unknown[][] = []
    const panne = new Error("cache indisponible")
    const effets: EffetsAnnonce = {
      invalidateAnnonce: async () => {
        appels.push([])
        throw panne
      },
    }
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("annonce.reglee", {
      annonceId: ANNONCE,
    })

    await expect(executer(plan, effets, {}, journal)).resolves.toBeUndefined()

    expect(appels).toHaveLength(1)
    expect(journal.mesures).toHaveLength(1)
    expect(journal.mesures[0]).toMatchObject({
      effet: "invalidation-cache",
      entite: { type: "annonce", id: ANNONCE },
      resultat: "echec",
      erreur: "cache indisponible",
    })
  })

  it("exécute une seule conséquence directement, sans journal, et laisse l'échec remonter", async () => {
    const { appels, effets } = portEnregistreur()
    const plan = declarerApresEcriture("annonce.reglee", {
      annonceId: ANNONCE,
    })
    const consequence = plan.consequences[0]!

    await executerUne(consequence, effets, {})

    expect(appels).toHaveLength(1)

    const panne = new Error("cache indisponible")
    await expect(
      executerUne(consequence, {
        invalidateAnnonce: async () => {
          throw panne
        },
      })
    ).rejects.toBe(panne)
  })

  it("prouve au type que la carte est totale et sans gestionnaire superflu", () => {
    const complet = {
      "invalidation-cache": async () => {},
    }
    const total: GestionnairesPour<ConsequenceAnnonce> = complet

    const partiel = {}
    // @ts-expect-error — un effet déclaré sans gestionnaire ne compile pas.
    const incomplet: GestionnairesPour<ConsequenceAnnonce> = partiel

    const superflu: GestionnairesPour<ConsequenceAnnonce> = {
      "invalidation-cache": async () => {},
      // @ts-expect-error — un gestionnaire que les genres n'émettent pas ne compile pas.
      reindexation: async () => {},
    }

    const lectures: LecturesAnnonce = {}
    expect([total, incomplet, superflu, lectures]).toHaveLength(4)
  })
})
