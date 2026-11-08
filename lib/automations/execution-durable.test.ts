import { describe, expect, it } from "vitest"

import { ACTIONS_PLANIFIEES } from "@/lib/automations/actions"
import type { DependancesAutomations } from "@/lib/automations/actions"
import type { ActionAutomation } from "@/lib/automations/regles"
import { executerActionOuRedeclaration } from "@/lib/automations/execution-durable"
import {
  creerPortCatalogueMemoire,
  creerPortEmailsMemoire,
  creerPortRechercheMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const MAINTENANT = new Date("2026-11-08T10:00:00.000Z")
const COMMANDE = "commande-951-filtre"

const SNAPSHOT = {
  userEmail: "client-951@example.test",
  orderId: COMMANDE,
  items: [
    {
      productName: "Produit 951",
      variantName: "Standard",
      quantity: 1,
      price: 1200,
    },
  ],
  total: 1200,
  shippingFee: 0,
  totalPayable: 1200,
  cityName: "Casablanca",
  address: "1 rue du Test",
  phone: "0600000000",
}

function contexte(
  action: ActionAutomation,
  dependances: DependancesAutomations
) {
  return {
    evenement: {
      type: "commande.creee" as const,
      entityType: "commande" as const,
      entityId: COMMANDE,
      payload: { snapshot: SNAPSHOT },
    },
    regle: { id: "regle-951", action },
    dependances,
  }
}

function ports() {
  const emails = creerPortEmailsMemoire()
  const recherche = creerPortRechercheMemoire()
  const catalogue = creerPortCatalogueMemoire()
  return {
    emails,
    recherche,
    catalogue,
    dependances: dependancesDeTest(MAINTENANT, {
      emails: emails.port,
      recherche: recherche.port,
      catalogue: catalogue.port,
    }),
  }
}

describe("le filtre des actions du travailleur", () => {
  it("n'exécute rien quand le genre ne déclare pas l'action de la Règle", async () => {
    const { emails, recherche, catalogue, dependances } = ports()

    // `commande.creee` ne déclare que `email.commande-creee` : cette Règle
    // réussit sans effet, jamais par un port d'une autre entité.
    await executerActionOuRedeclaration(contexte("index.produit", dependances))

    expect(emails.appels).toHaveLength(0)
    expect(recherche.operations).toHaveLength(0)
    expect(catalogue.invalidations).toHaveLength(0)
    expect(catalogue.purges).toHaveLength(0)
    expect(catalogue.structures).toBe(0)
  })

  it("exécute le pont de l'entité quand le genre déclare l'action", async () => {
    const { emails, dependances } = ports()

    await executerActionOuRedeclaration(
      contexte("email.commande-creee", dependances)
    )

    expect(emails.envoyes).toHaveLength(1)
    expect(emails.envoyes[0]).toMatchObject({
      genre: "confirmation",
      cleIdempotence: `commande.creee/${COMMANDE}/1`,
      destinataire: SNAPSHOT.userEmail,
    })
  })

  it("les actions planifiées sont exactement les trois digests et la réconciliation", () => {
    expect(ACTIONS_PLANIFIEES).toEqual([
      "digest.stock-bas",
      "digest.proprietaire",
      "reconciliation.recherche",
    ])
  })
})
