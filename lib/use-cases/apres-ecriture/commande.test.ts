import { describe, expect, it } from "vitest"

import type { OrderEmailSnapshot } from "@/lib/automations/charge"
import {
  declarerApresEcriture,
  type ConsequenceCommande,
} from "@/lib/apres-ecriture"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import { executer, executerUne, type EffetsCommande } from "./commande"
import type { GestionnairesPour } from "./executeur"

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
  it("déclare la création et l'exécute avec la charge utile de l'e-mail", async () => {
    const { appels, effets } = portsEnregistreurs()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
    })

    expect(plan.consequences.map((consequence) => consequence.effet)).toEqual([
      "email",
    ])
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

  it("déclare le changement de statut et remplit la charge utile du statut", async () => {
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
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("isole l'échec de l'e-mail et le journalise", async () => {
    const { appels, effets } = portsEnregistreurs()
    effets.sendOrderPlacedEmail = async () => {
      appels.push({ port: "email.commande-creee", arguments: [] })
      throw new Error("smtp indisponible")
    }
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
    })

    await expect(executer(plan, effets, journal)).resolves.toBeUndefined()

    expect(appels.map((appel) => appel.port)).toEqual(["email.commande-creee"])
    expect(
      journal.mesures.map((mesure) => [mesure.effet, mesure.resultat])
    ).toEqual([["email", "echec"]])
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
    const complet: GestionnairesPour<ConsequenceCommande> = {
      email: async () => {},
    }

    // @ts-expect-error — un effet déclaré sans gestionnaire ne compile pas.
    const incomplet: GestionnairesPour<ConsequenceCommande> = {}

    const superflu: GestionnairesPour<ConsequenceCommande> = {
      email: async () => {},
      // @ts-expect-error — un gestionnaire que les genres n'émettent pas ne compile pas.
      reindexation: async () => {},
    }

    expect([complet, incomplet, superflu]).toHaveLength(3)
  })
})
