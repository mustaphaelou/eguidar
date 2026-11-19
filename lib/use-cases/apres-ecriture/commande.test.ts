import { describe, expect, it } from "vitest"

import type { OrderEmailSnapshot } from "@/lib/automations/charge"
import {
  declarerApresEcriture,
  type ConsequenceCommande,
} from "@/lib/apres-ecriture"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import { executer, executerUne, type EffetsCommande } from "./commande"
import { type GestionnairesPour } from "./executeur"

const COMMANDE = "commande-951"
const SNAPSHOT: OrderEmailSnapshot = {
  userEmail: "client@example.test",
  orderId: COMMANDE,
  items: [
    {
      productName: "Produit 951",
      variantName: "Standard",
      quantity: 1,
      price: 12000,
    },
  ],
  total: 12000,
  shippingFee: 3500,
  totalPayable: 15500,
  cityName: "Ville 951",
  address: "12 avenue des Coutures",
  phone: "+212 600 951 951",
}

interface Appel {
  port: string
  arguments: unknown[]
}

function portsEnregistreurs(): {
  appels: Appel[]
  effets: EffetsCommande
} {
  const appels: Appel[] = []
  return {
    appels,
    effets: {
      sendOrderPlacedEmail: async (snapshot) => {
        appels.push({ port: "email.commande-creee", arguments: [snapshot] })
      },
      sendOrderStatusEmail: async (snapshot, statut) => {
        appels.push({
          port: "email.commande-statut",
          arguments: [snapshot, statut],
        })
      },
    },
  }
}

describe("l'adaptateur Commande", () => {
  it("déclare la création et délivre l'e-mail avec sa charge utile", async () => {
    const { appels, effets } = portsEnregistreurs()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
    })

    expect(plan.consequences.map((consequence) => consequence.effet)).toEqual([
      "email",
    ])
    expect(plan.consequences[0]!.payload).toEqual({ snapshot: SNAPSHOT })
    expect(plan.faits).toEqual([
      {
        declencheur: "commande.creee",
        entite: "commande",
        identifiant: COMMANDE,
        charge: { snapshot: SNAPSHOT },
      },
    ])

    await executer(plan, effets, journal)

    expect(appels).toEqual([
      { port: "email.commande-creee", arguments: [SNAPSHOT] },
    ])
    expect(journal.mesures).toHaveLength(1)
    expect(
      journal.mesures.map((mesure) => [
        mesure.effet,
        mesure.entite.id,
        mesure.resultat,
      ])
    ).toEqual([["email", COMMANDE, "succes"]])
    expect(journal.mesures.some((mesure) => mesure.resultat === "echec")).toBe(
      false
    )
  })

  it("déclare le changement de statut et délivre l'e-mail avec son statut", async () => {
    const { appels, effets } = portsEnregistreurs()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.statut.changee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      statut: "confirmed",
    })

    expect(plan.consequences.map((consequence) => consequence.effet)).toEqual([
      "email",
    ])
    expect(plan.consequences[0]!.payload).toEqual({
      snapshot: SNAPSHOT,
      statut: "confirmed",
    })
    expect(plan.faits).toEqual([
      {
        declencheur: "commande.statut.changee",
        entite: "commande",
        identifiant: COMMANDE,
        charge: { snapshot: SNAPSHOT, statut: "confirmed" },
      },
    ])

    await executer(plan, effets, journal)

    expect(appels).toEqual([
      {
        port: "email.commande-statut",
        arguments: [SNAPSHOT, "confirmed"],
      },
    ])
    expect(journal.mesures).toHaveLength(1)
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("isole l'échec d'un e-mail et poursuit la conséquence suivante", async () => {
    const { appels, effets } = portsEnregistreurs()
    effets.sendOrderPlacedEmail = async () => {
      appels.push({ port: "email.commande-creee", arguments: [] })
      throw new Error("smtp indisponible")
    }
    const journal = creerJournalEffetsMemoire()
    const creation = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
    })
    const statut = declarerApresEcriture("commande.statut.changee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      statut: "confirmed",
    })

    await expect(
      executer(
        {
          faits: [],
          consequences: [creation.consequences[0]!, statut.consequences[0]!],
        },
        effets,
        journal
      )
    ).resolves.toBeUndefined()

    expect(appels.map((appel) => appel.port)).toEqual([
      "email.commande-creee",
      "email.commande-statut",
    ])
    expect(
      journal.mesures.map((mesure) => [mesure.effet, mesure.resultat])
    ).toEqual([
      ["email", "echec"],
      ["email", "succes"],
    ])
    expect(journal.mesures[0]!.erreur).toBe("smtp indisponible")
  })

  it("exécute une seule conséquence directement, sans journal, et laisse l'échec remonter", async () => {
    const { appels, effets } = portsEnregistreurs()
    const plan = declarerApresEcriture("commande.statut.changee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      statut: "confirmed",
    })
    const email = plan.consequences[0]!

    await executerUne(email, effets)

    expect(appels).toEqual([
      {
        port: "email.commande-statut",
        arguments: [SNAPSHOT, "confirmed"],
      },
    ])

    const panne = new Error("smtp indisponible")
    const enPanne: EffetsCommande = {
      ...effets,
      sendOrderStatusEmail: async () => {
        throw panne
      },
    }
    await expect(executerUne(email, enPanne)).rejects.toBe(panne)
  })

  it("prouve au type que la carte est totale et sans gestionnaire superflu", () => {
    const complet = { email: async () => {} }
    const total: GestionnairesPour<ConsequenceCommande> = complet

    const partiel = {}
    // @ts-expect-error — un effet déclaré sans gestionnaire ne compile pas.
    const incomplet: GestionnairesPour<ConsequenceCommande> = partiel

    const superflu: GestionnairesPour<ConsequenceCommande> = {
      email: async () => {},
      // @ts-expect-error — un gestionnaire que les genres n'émettent pas ne compile pas.
      reindexation: async () => {},
    }

    expect([total, incomplet, superflu]).toHaveLength(3)
  })
})
