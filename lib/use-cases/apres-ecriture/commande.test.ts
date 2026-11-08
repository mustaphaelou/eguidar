import { describe, expect, it, vi } from "vitest"

import type { OrderEmailSnapshot } from "@/lib/automations/charge"
import {
  declarerApresEcriture,
  type ConsequenceCommande,
  type ConsequenceCommandePurge,
  type ProduitTouche,
} from "@/lib/apres-ecriture"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import {
  executer,
  executerUne,
  type EffetsCommande,
  type LecturesCommande,
} from "./commande"
import { LectureManquanteError, type GestionnairesPour } from "./executeur"

const COMMANDE = "commande-951"
const CATEGORIE = "categorie-951"
const PRODUIT: ProduitTouche = {
  id: "produit-951",
  slug: "produit-951",
  categoryId: CATEGORIE,
}
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
const LECTURE = {
  filAriane: (id: string) =>
    id === CATEGORIE ? [{ name: "Racine", slug: "racine" }] : [],
}
const PRODUIT_CATALOGUE: CatalogueEventProduct = {
  id: PRODUIT.id,
  slug: PRODUIT.slug,
  categoryChain: [{ slug: "racine" }],
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
      invalidateCommande: (commandeId) => {
        appels.push({ port: "invalidation-cache", arguments: [commandeId] })
      },
      invalidateProduits: async (produits) => {
        appels.push({ port: "purge-catalogue", arguments: [produits] })
      },
    },
  }
}

function purgeDe(plan: {
  consequences: readonly ConsequenceCommande[]
}): ConsequenceCommandePurge {
  const consequence = plan.consequences.find(
    (candidate): candidate is ConsequenceCommandePurge =>
      candidate.effet === "purge-catalogue"
  )
  if (!consequence) throw new Error("purge absente du plan")
  return consequence
}

describe("l'adaptateur Commande", () => {
  it("déclare la création et l'exécute dans l'ordre, avec les charges utiles", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = vi.fn(async () => LECTURE)
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      produitsDrainés: [PRODUIT],
    })

    expect(plan.consequences.map((consequence) => consequence.effet)).toEqual([
      "email",
      "invalidation-cache",
      "purge-catalogue",
    ])
    // Les Produits drainés restent des faits d'immédiat : la charge est intacte.
    expect(plan.faits).toEqual([
      {
        declencheur: "commande.creee",
        entite: "commande",
        identifiant: COMMANDE,
        charge: { snapshot: SNAPSHOT },
      },
    ])

    await executer(plan, effets, { structure: lecture }, journal)

    expect(appels).toEqual([
      { port: "email.commande-creee", arguments: [SNAPSHOT] },
      { port: "invalidation-cache", arguments: [COMMANDE] },
      { port: "purge-catalogue", arguments: [[PRODUIT_CATALOGUE]] },
    ])
    expect(lecture).toHaveBeenCalledOnce()
    expect(journal.mesures).toHaveLength(3)
    expect(
      journal.mesures.map((mesure) => [
        mesure.effet,
        mesure.entite.id,
        mesure.resultat,
      ])
    ).toEqual([
      ["email", COMMANDE, "succes"],
      ["invalidation-cache", COMMANDE, "succes"],
      ["purge-catalogue", COMMANDE, "succes"],
    ])
    expect(journal.mesures.some((mesure) => mesure.resultat === "echec")).toBe(
      false
    )
  })

  it("déclare le changement de statut et remplit les charges utiles du statut et des Produits restockés", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = vi.fn(async () => LECTURE)
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.statut.changee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      statut: "confirmed",
      produitsRestockés: [PRODUIT],
    })

    expect(plan.consequences.map((consequence) => consequence.effet)).toEqual([
      "email",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(plan.faits).toEqual([
      {
        declencheur: "commande.statut.changee",
        entite: "commande",
        identifiant: COMMANDE,
        charge: { snapshot: SNAPSHOT, statut: "confirmed" },
      },
    ])

    await executer(plan, effets, { structure: lecture }, journal)

    expect(appels).toEqual([
      {
        port: "email.commande-statut",
        arguments: [SNAPSHOT, "confirmed"],
      },
      { port: "invalidation-cache", arguments: [COMMANDE] },
      { port: "purge-catalogue", arguments: [[PRODUIT_CATALOGUE]] },
    ])
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("échoue nommément et journalise quand la lecture de la Structure manque", async () => {
    const { appels, effets } = portsEnregistreurs()
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      produitsDrainés: [PRODUIT],
    })

    await expect(executer(plan, effets, {}, journal)).resolves.toBeUndefined()

    // L'e-mail et l'invalidation ont bien été tentés, la purge a échoué sans
    // être sautée en silence.
    expect(appels.map((appel) => appel.port)).toEqual([
      "email.commande-creee",
      "invalidation-cache",
    ])
    expect(journal.mesures).toHaveLength(3)
    const echec = journal.mesures[2]!
    expect(echec).toMatchObject({
      effet: "purge-catalogue",
      entite: { type: "commande", id: COMMANDE },
      resultat: "echec",
    })
    expect(echec.erreur).toContain("lecture après-écriture manquante")
    expect(echec.erreur).toContain("structure")

    const lectureManquante: LecturesCommande = {}
    await expect(
      executerUne(purgeDe(plan), effets, lectureManquante)
    ).rejects.toBeInstanceOf(LectureManquanteError)
  })

  it("ne lit la Structure qu'une fois par plan, et seulement si la purge porte des Produits", async () => {
    const { appels, effets } = portsEnregistreurs()
    const lecture = vi.fn(async () => LECTURE)
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      produitsDrainés: [PRODUIT],
    })
    const purge = purgeDe(plan)

    await executer(
      { faits: [], consequences: [purge, purge] },
      effets,
      { structure: lecture },
      journal
    )

    expect(lecture).toHaveBeenCalledOnce()
    expect(appels).toHaveLength(2)

    const sansProduit = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
    })
    appels.length = 0
    await executer(sansProduit, effets, {}, creerJournalEffetsMemoire())

    expect(appels).toEqual([
      { port: "email.commande-creee", arguments: [SNAPSHOT] },
      { port: "invalidation-cache", arguments: [COMMANDE] },
      { port: "purge-catalogue", arguments: [[]] },
    ])
  })

  it("isole l'échec d'une conséquence et poursuit la suivante", async () => {
    const { appels, effets } = portsEnregistreurs()
    effets.sendOrderPlacedEmail = async () => {
      appels.push({ port: "email.commande-creee", arguments: [] })
      throw new Error("smtp indisponible")
    }
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: COMMANDE,
      snapshot: SNAPSHOT,
      produitsDrainés: [PRODUIT],
    })

    await expect(
      executer(plan, effets, { structure: async () => LECTURE }, journal)
    ).resolves.toBeUndefined()

    expect(appels.map((appel) => appel.port)).toEqual([
      "email.commande-creee",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(
      journal.mesures.map((mesure) => [mesure.effet, mesure.resultat])
    ).toEqual([
      ["email", "echec"],
      ["invalidation-cache", "succes"],
      ["purge-catalogue", "succes"],
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
    const email = plan.consequences.find(
      (consequence) => consequence.effet === "email"
    )!

    await executerUne(email, effets, {})

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
    await expect(executerUne(email, enPanne, {})).rejects.toBe(panne)
  })

  it("prouve au type que la carte est totale et sans gestionnaire superflu", () => {
    const complet = {
      email: async () => {},
      "invalidation-cache": async () => {},
      "purge-catalogue": async () => {},
    }
    const total: GestionnairesPour<ConsequenceCommande> = complet

    const partiel = {
      email: async () => {},
      "invalidation-cache": async () => {},
    }
    // @ts-expect-error — un effet déclaré sans gestionnaire ne compile pas.
    const incomplet: GestionnairesPour<ConsequenceCommande> = partiel

    const superflu: GestionnairesPour<ConsequenceCommande> = {
      email: async () => {},
      "invalidation-cache": async () => {},
      "purge-catalogue": async () => {},
      // @ts-expect-error — un gestionnaire que les genres n'émettent pas ne compile pas.
      reindexation: async () => {},
    }

    expect([total, incomplet, superflu]).toHaveLength(3)
  })
})
