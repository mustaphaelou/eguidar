import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { enregistrerEvenement } from "@/lib/automations/evenements"
import { executerLesEvenements } from "@/lib/automations/executeur"
import {
  basculerRegle,
  creerRegle,
  lireRegle,
  listerEvenementsSimulables,
  listerRegles,
  modifierRegle,
  reessayerExecution,
  simulerRegle,
  type EntreeRegle,
} from "@/lib/use-cases/automatisations"
import {
  creerPortCatalogueMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"
import { listerExecutions } from "@/lib/automations/historique"

const runId = randomUUID().slice(0, 8)
const AUTEUR = `proprietaire-${runId}@example.test`
const AUTRE_AUTEUR = `editeur-${runId}@example.test`
const MAINTENANT = new Date("2026-10-28T09:00:00.000Z")

async function balayer() {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
}

beforeEach(balayer)

afterAll(async () => {
  await balayer()
  await prisma.$disconnect()
})

function nomDeRegle(suffixe: string): string {
  return `Règle ${runId} ${suffixe}`
}

async function creerUneRegle(surcharges: Partial<EntreeRegle> = {}) {
  return creerRegle(
    {
      nom: nomDeRegle("indexation"),
      declencheur: "produit.enregistre",
      condition: { type: "toujours" },
      action: "index.produit",
      actif: true,
      ...surcharges,
    },
    AUTEUR,
    MAINTENANT
  )
}

describe("l'éditeur de Règles d'automatisation", () => {
  it("crée une règle depuis le vocabulaire et lui laisse une révision attribuée", async () => {
    const id = await creerUneRegle({ nom: "Indexation du Produit" })

    expect(id).toBe("indexation-du-produit")
    await expect(
      prisma.automationRule.findUniqueOrThrow({ where: { id } })
    ).resolves.toMatchObject({
      name: "Indexation du Produit",
      enabled: true,
      trigger: "produit.enregistre",
      action: "index.produit",
    })

    const revisions = await prisma.automationRuleRevision.findMany({
      where: { ruleId: id },
    })
    expect(revisions).toHaveLength(1)
    expect(revisions[0]!.author).toBe(AUTEUR)
    expect(revisions[0]!.createdAt).toEqual(MAINTENANT)
    expect(revisions[0]!.snapshot).toMatchObject({
      id,
      nom: "Indexation du Produit",
      declencheur: "produit.enregistre",
      action: "index.produit",
      actif: true,
    })
  })

  it("refuse une combinaison non prise en charge en la nommant, sans rien écrire", async () => {
    await expect(
      creerUneRegle({
        declencheur: "produit.enregistre",
        action: "email.commande-statut",
      })
    ).rejects.toThrow(
      "Combinaison non prise en charge : « Produit enregistré » (produit.enregistre) ne déclenche pas « E-mail de statut de Commande » (email.commande-statut)."
    )
    await expect(prisma.automationRule.count()).resolves.toBe(0)
  })

  it("refuse un identifiant déjà pris en le nommant", async () => {
    await creerUneRegle({ nom: "Réconciliation" })
    await expect(
      creerUneRegle({ nom: "Réconciliation", action: "invalidation.catalogue" })
    ).rejects.toThrow(
      "Une Règle d'automatisation avec cet identifiant existe déjà"
    )
  })

  it("modifie une règle, attribue la révision, et n'en ajoute pas pour un statu quo", async () => {
    const id = await creerUneRegle({ nom: "Indexation" })

    await modifierRegle(
      {
        regleId: id,
        nom: "Indexation du stock",
        declencheur: "variante.stock.changee",
        condition: { type: "toujours" },
        action: "index.produit",
        actif: false,
      },
      AUTRE_AUTEUR,
      new Date(MAINTENANT.getTime() + 60_000)
    )

    await expect(
      prisma.automationRule.findUniqueOrThrow({ where: { id } })
    ).resolves.toMatchObject({
      name: "Indexation du stock",
      trigger: "variante.stock.changee",
      enabled: false,
    })

    const revisions = await prisma.automationRuleRevision.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: "asc" },
    })
    expect(revisions.map((revision) => revision.author)).toEqual([
      AUTEUR,
      AUTRE_AUTEUR,
    ])
    expect(revisions[1]!.snapshot).toMatchObject({
      nom: "Indexation du stock",
      declencheur: "variante.stock.changee",
      actif: false,
    })

    await modifierRegle(
      {
        regleId: id,
        nom: "Indexation du stock",
        declencheur: "variante.stock.changee",
        condition: { type: "toujours" },
        action: "index.produit",
        actif: false,
      },
      AUTRE_AUTEUR,
      new Date(MAINTENANT.getTime() + 120_000)
    )
    await expect(
      prisma.automationRuleRevision.count({ where: { ruleId: id } })
    ).resolves.toBe(2)
  })

  it("désactive une règle, annule son exécution en cours et libère son Événement", async () => {
    const id = await creerUneRegle()
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "produit.enregistre",
        entityType: "produit",
        entityId: `produit-${runId}`,
        seq: 1,
        attemptOf: 1,
        payload: { produitId: `produit-${runId}` },
        occurredAt: MAINTENANT,
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
        status: "en_cours",
        lockedUntil: new Date(MAINTENANT.getTime() + 60_000),
      },
    })
    const execution = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: id,
        action: "index.produit",
        status: "en_cours",
        attempt: 1,
        startedAt: new Date(MAINTENANT.getTime() - 5_000),
      },
    })

    await basculerRegle(id, false, AUTEUR, MAINTENANT)

    await expect(
      prisma.automationRule.findUniqueOrThrow({ where: { id } })
    ).resolves.toMatchObject({ enabled: false })

    const annulee = await prisma.automationRun.findUniqueOrThrow({
      where: { id: execution.id },
    })
    expect(annulee.status).toBe("ignore")
    expect(annulee.lastError).toBe("annulée : règle désactivée")
    expect(annulee.finishedAt).toEqual(MAINTENANT)
    expect(annulee.durationMs).toBe(5_000)

    const libere = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(libere.lockedUntil).toBeNull()

    const revisions = await prisma.automationRuleRevision.findMany({
      where: { ruleId: id },
      orderBy: { createdAt: "asc" },
    })
    expect(revisions).toHaveLength(2)
    expect(revisions[1]!.author).toBe(AUTEUR)
    expect(revisions[1]!.snapshot).toMatchObject({ actif: false })
  })

  it("réactive une règle sans rejouer les Événements consommés pendant sa désactivation", async () => {
    const id = await creerUneRegle({
      declencheur: "structure.modifiee",
      action: "invalidation.structure",
      actif: false,
    })
    const entite = `categorie-${runId}-pas-de-rejeu`
    await prisma.$transaction((tx) =>
      enregistrerEvenement(tx, {
        type: "structure.modifiee",
        entityType: "categorie",
        entityId: entite,
        occurredAt: MAINTENANT,
        payload: { categorieId: entite },
      })
    )
    const catalogue = creerPortCatalogueMemoire()
    const dependances = dependancesDeTest(MAINTENANT, {
      catalogue: catalogue.port,
    })

    await executerLesEvenements({ maintenant: MAINTENANT }, dependances)
    expect(catalogue.structures).toBe(0)
    await expect(
      prisma.automationRun.count({ where: { ruleId: id } })
    ).resolves.toBe(0)

    await basculerRegle(id, true, AUTEUR, MAINTENANT)
    await executerLesEvenements({ maintenant: MAINTENANT }, dependances)

    expect(catalogue.structures).toBe(0)
    await expect(
      prisma.automationRun.count({ where: { ruleId: id } })
    ).resolves.toBe(0)
  })

  it("simule une règle sur un Événement réel sans écrire d'exécution ni rien envoyer", async () => {
    const id = await creerUneRegle({
      nom: "Statut expédié",
      declencheur: "commande.statut.changee",
      condition: { type: "statut-commande", statuts: ["shipped"] },
      action: "email.commande-statut",
    })
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "commande.statut.changee",
        entityType: "commande",
        entityId: `commande-${runId}-simulee`,
        seq: 1,
        attemptOf: 1,
        payload: {
          statut: "shipped",
          snapshot: { orderId: `commande-${runId}-simulee` },
        },
        occurredAt: MAINTENANT,
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
      },
    })

    await expect(
      simulerRegle({ regleId: id, evenementId: evenement.id }, MAINTENANT)
    ).resolves.toMatchObject({
      decision: "enverrait",
      motif:
        "La condition « Statut de Commande » retient le statut « shipped » : l'action « E-mail de statut de Commande » serait exécutée.",
      evenement: { id: evenement.id, entityId: `commande-${runId}-simulee` },
    })

    await expect(prisma.automationRun.count()).resolves.toBe(0)
    await expect(
      prisma.automationEvent.findUniqueOrThrow({ where: { id: evenement.id } })
    ).resolves.toMatchObject({ status: "en_attente", attempts: 0 })
  })

  it("rend le motif d'un refus de simulation : statut non retenu, règle désactivée, Événement expiré", async () => {
    const id = await creerUneRegle({
      nom: "Statut retenu",
      declencheur: "commande.statut.changee",
      condition: { type: "statut-commande", statuts: ["shipped"] },
      action: "email.commande-statut",
      actif: true,
    })
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "commande.statut.changee",
        entityType: "commande",
        entityId: `commande-${runId}-refus`,
        seq: 1,
        attemptOf: 1,
        payload: { statut: "pending", snapshot: {} },
        occurredAt: MAINTENANT,
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
      },
    })

    await expect(
      simulerRegle({ regleId: id, evenementId: evenement.id }, MAINTENANT)
    ).resolves.toMatchObject({
      decision: "ignorerait",
      motif:
        "La condition « Statut de Commande » ne retient pas le statut « pending » : l'action « E-mail de statut de Commande » serait ignorée.",
    })

    await basculerRegle(id, false, AUTEUR, MAINTENANT)
    await expect(
      simulerRegle({ regleId: id, evenementId: evenement.id }, MAINTENANT)
    ).resolves.toMatchObject({
      decision: "ignorerait",
      motif: "La règle est désactivée : l'action ne serait pas exécutée.",
    })

    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { expiresAt: new Date(MAINTENANT.getTime() - 1_000) },
    })
    await basculerRegle(id, true, AUTEUR, MAINTENANT)
    await expect(
      simulerRegle({ regleId: id, evenementId: evenement.id }, MAINTENANT)
    ).resolves.toMatchObject({
      decision: "ignorerait",
      motif:
        "L'Événement a expiré le 2026-10-28T08:59:59.000Z : l'action ne serait pas exécutée.",
    })
  })

  it("liste les Événements réels qui peuvent servir de sujet à une simulation", async () => {
    const id = await creerUneRegle({
      nom: "Simulation listée",
      declencheur: "structure.modifiee",
      action: "invalidation.structure",
    })
    for (const [index, entite] of ["a", "b"].entries()) {
      await prisma.automationEvent.create({
        data: {
          type: "structure.modifiee",
          entityType: "categorie",
          entityId: `categorie-${runId}-${entite}`,
          seq: index + 1,
          attemptOf: index + 1,
          payload: { categorieId: `categorie-${runId}-${entite}` },
          occurredAt: new Date(MAINTENANT.getTime() + index * 1_000),
          expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
        },
      })
    }
    await prisma.automationEvent.create({
      data: {
        type: "produit.enregistre",
        entityType: "produit",
        entityId: `produit-${runId}-autre`,
        seq: 1,
        attemptOf: 1,
        payload: {},
        occurredAt: MAINTENANT,
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
      },
    })

    const evenements = await listerEvenementsSimulables(id)
    expect(evenements.map((evenement) => evenement.entityId)).toEqual([
      `categorie-${runId}-b`,
      `categorie-${runId}-a`,
    ])
  })

  it("réessaie une Exécution en échec et l'enregistre comme manuelle, distincte du balayage", async () => {
    const id = await creerUneRegle({
      nom: "Invalidation à réessayer",
      declencheur: "structure.modifiee",
      action: "invalidation.structure",
    })
    const entite = `categorie-${runId}-reessai`
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "structure.modifiee",
        entityType: "categorie",
        entityId: entite,
        seq: 1,
        attemptOf: 1,
        payload: { categorieId: entite },
        occurredAt: new Date(MAINTENANT.getTime() - 10_000),
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
        status: "mort",
        attempts: 3,
        lastError: "cache indisponible",
      },
    })
    const echec = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: id,
        action: "invalidation.structure",
        status: "echoue",
        attempt: 3,
        lastError: "cache indisponible",
        startedAt: new Date(MAINTENANT.getTime() - 10_000),
        finishedAt: new Date(MAINTENANT.getTime() - 9_500),
        trigger: "evenement",
      },
    })
    const catalogue = creerPortCatalogueMemoire()

    await expect(
      reessayerExecution(
        echec.id,
        dependancesDeTest(MAINTENANT, { catalogue: catalogue.port })
      )
    ).resolves.toMatchObject({ statut: "reussi", erreur: null })
    expect(catalogue.structures).toBe(1)

    const executions = await prisma.automationRun.findMany({
      where: { eventId: evenement.id },
      orderBy: { attempt: "asc" },
    })
    expect(
      executions.map((execution) => [
        execution.attempt,
        execution.status,
        execution.trigger,
      ])
    ).toEqual([
      [3, "echoue", "evenement"],
      [4, "reussi", "manuel"],
    ])

    await expect(
      prisma.automationEvent.findUniqueOrThrow({ where: { id: evenement.id } })
    ).resolves.toMatchObject({ status: "reussi", lastError: null })

    const historique = await listerExecutions({ regleId: id })
    expect(historique[0]).toMatchObject({
      declencheur: "manuel",
      statut: "reussi",
      tentative: 4,
    })
  })

  it("refuse de réessayer une Exécution réussie, et garde le réessai raté en échec", async () => {
    const id = await creerUneRegle({
      nom: "Invalidation ratée",
      declencheur: "structure.modifiee",
      action: "invalidation.structure",
    })
    const entite = `categorie-${runId}-reessai-rate`
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "structure.modifiee",
        entityType: "categorie",
        entityId: entite,
        seq: 1,
        attemptOf: 1,
        payload: { categorieId: entite },
        occurredAt: new Date(MAINTENANT.getTime() - 10_000),
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
        status: "mort",
        attempts: 3,
        lastError: "cache indisponible",
      },
    })
    const reussie = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: id,
        action: "invalidation.structure",
        status: "reussi",
        attempt: 1,
        startedAt: new Date(MAINTENANT.getTime() - 30_000),
        finishedAt: new Date(MAINTENANT.getTime() - 29_000),
      },
    })
    await expect(
      reessayerExecution(reussie.id, dependancesDeTest(MAINTENANT))
    ).rejects.toThrow("Seule une Exécution en échec peut être réessayée")

    const echec = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: id,
        action: "invalidation.structure",
        status: "echoue",
        attempt: 3,
        lastError: "cache indisponible",
        startedAt: new Date(MAINTENANT.getTime() - 10_000),
        finishedAt: new Date(MAINTENANT.getTime() - 9_500),
      },
    })
    const catalogue = creerPortCatalogueMemoire({
      panneStructure: new Error("cache toujours indisponible"),
    })

    await expect(
      reessayerExecution(
        echec.id,
        dependancesDeTest(MAINTENANT, { catalogue: catalogue.port })
      )
    ).resolves.toMatchObject({
      statut: "echoue",
      erreur: "cache toujours indisponible",
    })
    const executions = await prisma.automationRun.findMany({
      where: { eventId: evenement.id, trigger: "manuel" },
    })
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({
      status: "echoue",
      lastError: "cache toujours indisponible",
    })
    await expect(
      prisma.automationEvent.findUniqueOrThrow({ where: { id: evenement.id } })
    ).resolves.toMatchObject({ status: "mort" })
  })

  it("liste les règles avec leur état et leur dernière exécution", async () => {
    const id = await creerUneRegle()
    const regle = await lireRegle(id)
    expect(regle?.derniereExecution).toBeNull()
    expect(regle?.revisions).toHaveLength(1)

    const evenement = await prisma.automationEvent.create({
      data: {
        type: "produit.enregistre",
        entityType: "produit",
        entityId: `produit-${runId}-liste`,
        seq: 1,
        attemptOf: 1,
        payload: { produitId: `produit-${runId}-liste` },
        occurredAt: MAINTENANT,
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
        status: "reussi",
      },
    })
    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: id,
        action: "index.produit",
        status: "reussi",
        attempt: 1,
        startedAt: MAINTENANT,
        finishedAt: new Date(MAINTENANT.getTime() + 1_000),
      },
    })

    const regles = await listerRegles()
    expect(regles).toHaveLength(1)
    expect(regles[0]).toMatchObject({
      id,
      nom: nomDeRegle("indexation"),
      declencheur: "produit.enregistre",
      action: "index.produit",
      actif: true,
      derniereExecution: { statut: "reussi", debut: MAINTENANT },
    })
  })
})
