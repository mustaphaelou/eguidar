import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import type { AutomationEvent } from "@/lib/generated/prisma/client"
import {
  enregistrerEvenement,
  type TypeEvenementAutomation,
} from "@/lib/automations/evenements"
import {
  annulerExecutionsEnCours,
  ouvrirExecution,
  ouvrirReessai,
  terminerExecution,
} from "@/lib/automations/executions"
import { semerLesRegles } from "@/lib/automations/regles"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-10-28T07:00:00.000Z")

async function creerEvenement(
  type: TypeEvenementAutomation = "produit.enregistre",
  entityId?: string
) {
  const id = entityId ?? `produit-${runId}-${randomUUID().slice(0, 6)}`
  let evenement!: AutomationEvent
  const estPlanification = type.startsWith("planification.")
  await prisma.$transaction(async (tx) => {
    evenement = await enregistrerEvenement(tx, {
      type,
      entityType: estPlanification ? "planification" : "produit",
      entityId: id,
      occurredAt: MAINTENANT,
      payload: estPlanification
        ? { jour: "2026-10-28" }
        : {
            produitId: id,
            slug: `slug-${id}`,
            slugPrecedent: null,
            categoryId: null,
            categoryIdPrecedent: null,
          },
    })
  })
  return { evenement, entityId: id }
}

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await semerLesRegles()
})

afterAll(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.$disconnect()
})

describe("ouvrirExecution", () => {
  it("première tentative = 1", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })

    const resultat = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })

    expect(resultat.attempt).toBe(1)
    const run = await prisma.automationRun.findUniqueOrThrow({
      where: { id: resultat.id },
    })
    expect(run.status).toBe("en_cours")
    expect(run.trigger).toBe("evenement")
  })

  it("tentative terminale suivie de max(attempt) + 1", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })

    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "reussi",
        attempt: 3,
        startedAt: new Date(MAINTENANT.getTime() - 1000),
        finishedAt: MAINTENANT,
      },
    })

    const resultat = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })

    expect(resultat.attempt).toBe(4)
  })

  it("tentative en_cours reprise avec le même numéro", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })

    const ancien = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "en_cours",
        attempt: 2,
        startedAt: new Date(MAINTENANT.getTime() - 5000),
        finishedAt: new Date(MAINTENANT.getTime() - 1000),
        lastError: "boom",
        durationMs: 123,
      },
    })

    const resultat = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })

    expect(resultat.id).toBe(ancien.id)
    expect(resultat.attempt).toBe(2)
    const run = await prisma.automationRun.findUniqueOrThrow({
      where: { id: resultat.id },
    })
    expect(run.startedAt).toEqual(MAINTENANT)
    expect(run.finishedAt).toBeNull()
    expect(run.lastError).toBeNull()
    expect(run.durationMs).toBeNull()
  })

  it("planification.* donne planification", async () => {
    const { evenement } = await creerEvenement("planification.digest-stock-bas")
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "digest-stock-bas" },
    })

    const resultat = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })

    const run = await prisma.automationRun.findUniqueOrThrow({
      where: { id: resultat.id },
    })
    expect(run.trigger).toBe("planification")
  })

  it("après redrive, anciennes lignes intactes et nouvelle tentative suit le max", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })

    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "reussi",
        attempt: 3,
        startedAt: new Date(MAINTENANT.getTime() - 1000),
        finishedAt: MAINTENANT,
      },
    })

    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "mort", attempts: 3 },
    })

    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "en_attente", attempts: 0 },
    })

    const resultat = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })

    expect(resultat.attempt).toBe(4)
    const runs = await prisma.automationRun.findMany({
      where: { eventId: evenement.id },
      orderBy: { attempt: "asc" },
    })
    expect(runs.map((r) => r.attempt)).toEqual([3, 4])
  })

  it("une Exécution manuelle n'est pas écrasée par un balayage", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })

    const manuel = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "reussi",
        attempt: 1,
        startedAt: MAINTENANT,
        finishedAt: MAINTENANT,
        trigger: "manuel",
      },
    })

    const sweep = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: new Date(MAINTENANT.getTime() + 1000),
    })

    expect(sweep.attempt).toBe(2)
    const manuelRun = await prisma.automationRun.findUniqueOrThrow({
      where: { id: manuel.id },
    })
    expect(manuelRun.trigger).toBe("manuel")
  })

  it("collision unique : recompte et réessaie", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })

    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "reussi",
        attempt: 2,
        startedAt: MAINTENANT,
        finishedAt: MAINTENANT,
      },
    })
    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "reussi",
        attempt: 1,
        startedAt: MAINTENANT,
        finishedAt: MAINTENANT,
      },
    })

    const resultat = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })

    expect(resultat.attempt).toBe(3)
  })
})

describe("terminerExecution", () => {
  it("durée depuis startedAt, jamais négative", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })
    const run = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: new Date(MAINTENANT.getTime() - 5000),
    })

    await terminerExecution({
      executionId: run.id,
      issue: "reussi",
      maintenant: MAINTENANT,
    })

    const termine = await prisma.automationRun.findUniqueOrThrow({
      where: { id: run.id },
    })
    expect(termine.durationMs).toBe(5000)
    expect(termine.lastError).toBeNull()
    expect(termine.status).toBe("reussi")
  })

  it("lastError est le motif pour echoue/ignore, null pour reussi", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })
    const run = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })

    await terminerExecution({
      executionId: run.id,
      issue: "echoue",
      erreur: "panne",
      maintenant: MAINTENANT,
    })
    const echoue = await prisma.automationRun.findUniqueOrThrow({
      where: { id: run.id },
    })
    expect(echoue.lastError).toBe("panne")

    const run2 = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: MAINTENANT,
    })
    await terminerExecution({
      executionId: run2.id,
      issue: "ignore",
      erreur: "annulée",
      maintenant: MAINTENANT,
    })
    const ignore = await prisma.automationRun.findUniqueOrThrow({
      where: { id: run2.id },
    })
    expect(ignore.lastError).toBe("annulée")
  })

  it("écriture terminale après annulation gagne", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })
    const run = await ouvrirExecution({
      evenement: { id: evenement.id, type: evenement.type },
      regle: { id: regle.id, action: regle.action },
      maintenant: new Date(MAINTENANT.getTime() - 1000),
    })

    await annulerExecutionsEnCours({
      regleId: regle.id,
      maintenant: MAINTENANT,
      client: prisma as unknown as Prisma.TransactionClient,
    })

    await terminerExecution({
      executionId: run.id,
      issue: "reussi",
      maintenant: new Date(MAINTENANT.getTime() + 100),
    })

    const final = await prisma.automationRun.findUniqueOrThrow({
      where: { id: run.id },
    })
    expect(final.status).toBe("reussi")
  })

  it("id manquant lève", async () => {
    await expect(
      terminerExecution({
        executionId: "inexistant",
        issue: "reussi",
        maintenant: MAINTENANT,
      })
    ).rejects.toThrow()
  })
})

describe("annulerExecutionsEnCours", () => {
  it("seules les lignes en_cours de la Règle changent, bail libéré si encore en_cours", async () => {
    const { evenement } = await creerEvenement()
    const autreRegle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "invalidation-catalogue" },
    })
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })

    const run = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "en_cours",
        attempt: 1,
        startedAt: new Date(MAINTENANT.getTime() - 5000),
      },
    })
    const autreRun = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: autreRegle.id,
        action: autreRegle.action,
        status: "en_cours",
        attempt: 1,
        startedAt: new Date(MAINTENANT.getTime() - 5000),
      },
    })

    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: {
        status: "en_cours",
        lockedUntil: new Date(MAINTENANT.getTime() + 60000),
      },
    })

    await annulerExecutionsEnCours({
      regleId: regle.id,
      maintenant: MAINTENANT,
      client: prisma as unknown as Prisma.TransactionClient,
    })

    const annulee = await prisma.automationRun.findUniqueOrThrow({
      where: { id: run.id },
    })
    expect(annulee.status).toBe("ignore")
    expect(annulee.lastError).toBe("annulée : règle désactivée")
    expect(annulee.durationMs).toBe(5000)

    const autre = await prisma.automationRun.findUniqueOrThrow({
      where: { id: autreRun.id },
    })
    expect(autre.status).toBe("en_cours")

    const libere = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(libere.lockedUntil).toBeNull()
  })
})

describe("ouvrirReessai", () => {
  async function preparerEchec() {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })
    const execution = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 3,
        lastError: "panne",
        startedAt: new Date(MAINTENANT.getTime() - 10000),
        finishedAt: new Date(MAINTENANT.getTime() - 9500),
      },
    })
    return { evenement, regle, execution }
  }

  it("refus introuvable", async () => {
    const res = await ouvrirReessai("inexistant", { maintenant: MAINTENANT })
    expect(res).toEqual({ ok: false, raison: { type: "introuvable" } })
  })

  it("refus pas-en-echec", async () => {
    const { execution } = await preparerEchec()
    await prisma.automationRun.update({
      where: { id: execution.id },
      data: { status: "reussi" },
    })
    const res = await ouvrirReessai(execution.id, { maintenant: MAINTENANT })
    expect(res).toEqual({ ok: false, raison: { type: "pas-en-echec" } })
  })

  it("refus evenement-disparu", async () => {
    const { execution } = await preparerEchec()
    await prisma.automationRun.update({
      where: { id: execution.id },
      data: { eventId: null },
    })
    const res = await ouvrirReessai(execution.id, { maintenant: MAINTENANT })
    expect(res).toEqual({ ok: false, raison: { type: "evenement-disparu" } })
  })

  it("refus regle-disparue", async () => {
    const { execution } = await preparerEchec()
    await prisma.automationRun.update({
      where: { id: execution.id },
      data: { ruleId: null },
    })
    const res = await ouvrirReessai(execution.id, { maintenant: MAINTENANT })
    expect(res).toEqual({ ok: false, raison: { type: "regle-disparue" } })
  })

  it("refus evenement-expire et n'écrit rien", async () => {
    const { evenement, execution } = await preparerEchec()
    const expireLe = new Date(MAINTENANT.getTime() - 60000)
    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { expiresAt: expireLe },
    })
    const avant = await prisma.automationRun.count({
      where: { eventId: evenement.id },
    })
    const res = await ouvrirReessai(execution.id, { maintenant: MAINTENANT })
    expect(res).toEqual({
      ok: false,
      raison: { type: "evenement-expire", expireLe },
    })
    const apres = await prisma.automationRun.count({
      where: { eventId: evenement.id },
    })
    expect(apres).toBe(avant)
  })

  it("refus regle-desactivee dans la transaction et n'écrit rien", async () => {
    const { evenement, regle, execution } = await preparerEchec()
    await prisma.automationRule.update({
      where: { id: regle.id },
      data: { enabled: false },
    })
    const avant = await prisma.automationRun.count({
      where: { eventId: evenement.id },
    })
    try {
      const res = await ouvrirReessai(execution.id, { maintenant: MAINTENANT })
      expect(res).toEqual({
        ok: false,
        raison: { type: "regle-desactivee" },
      })
      const apres = await prisma.automationRun.count({
        where: { eventId: evenement.id },
      })
      expect(apres).toBe(avant)
    } finally {
      await prisma.automationRule.update({
        where: { id: regle.id },
        data: { enabled: true },
      })
    }
  })

  it("absorbe un conflit d'unicité sur deux réessais concurrents", async () => {
    const { execution } = await preparerEchec()
    const [a, b] = await Promise.all([
      ouvrirReessai(execution.id, { maintenant: MAINTENANT }),
      ouvrirReessai(execution.id, { maintenant: MAINTENANT }),
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(a.execution.id).not.toBe(b.execution.id)
      const runs = await prisma.automationRun.findMany({
        where: { id: { in: [a.execution.id, b.execution.id] } },
        orderBy: { attempt: "asc" },
      })
      expect(runs.map((r) => r.attempt)).toEqual([4, 5])
    }
  })

  it("tentative manuelle = max + 1 et retourne event/regle", async () => {
    const { evenement, regle, execution } = await preparerEchec()
    const res = await ouvrirReessai(execution.id, { maintenant: MAINTENANT })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.execution.id).toBeTruthy()
      expect(res.evenement.id).toBe(evenement.id)
      expect(res.regle.id).toBe(regle.id)
      const run = await prisma.automationRun.findUniqueOrThrow({
        where: { id: res.execution.id },
      })
      expect(run.attempt).toBe(4)
      expect(run.trigger).toBe("manuel")
      expect(run.status).toBe("en_cours")
    }
  })
})

describe("réparation", () => {
  it("succès manuel retourne l'Événement réussi si aucun sibling en échec", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })
    const execution = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        finishedAt: MAINTENANT,
      },
    })

    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "mort", attempts: 1 },
    })

    const ouverture = await ouvrirReessai(execution.id, {
      maintenant: MAINTENANT,
    })
    if (ouverture.ok) {
      await terminerExecution({
        executionId: ouverture.execution.id,
        issue: "reussi",
        maintenant: MAINTENANT,
      })
    }

    const ev = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(ev.status).toBe("reussi")
    expect(ev.lastError).toBeNull()
    expect(ev.lockedUntil).toBeNull()
  })

  it("échec manuel n'écrit rien sur l'Événement", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })
    const execution = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        finishedAt: MAINTENANT,
      },
    })

    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "mort", lastError: "panne", attempts: 1 },
    })

    const ouverture = await ouvrirReessai(execution.id, {
      maintenant: MAINTENANT,
    })
    if (ouverture.ok) {
      await terminerExecution({
        executionId: ouverture.execution.id,
        issue: "echoue",
        erreur: "panne",
        maintenant: MAINTENANT,
      })
    }

    const ev = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(ev.status).toBe("mort")
    expect(ev.lastError).toBe("panne")
  })

  it("succès avec sibling en échec laisse l'Événement échoué", async () => {
    const { evenement } = await creerEvenement()
    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-produit" },
    })
    const autreRegle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "invalidation-catalogue" },
    })

    const execution = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        finishedAt: MAINTENANT,
      },
    })

    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: autreRegle.id,
        action: autreRegle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        finishedAt: MAINTENANT,
      },
    })

    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "mort", lastError: "panne", attempts: 1 },
    })

    const ouverture = await ouvrirReessai(execution.id, {
      maintenant: MAINTENANT,
    })
    if (ouverture.ok) {
      await terminerExecution({
        executionId: ouverture.execution.id,
        issue: "reussi",
        maintenant: MAINTENANT,
      })
    }

    const ev = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(ev.status).toBe("mort")
  })
})
