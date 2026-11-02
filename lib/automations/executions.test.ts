import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { enregistrerEvenement } from "@/lib/automations/evenements"
import { semerLesRegles } from "@/lib/automations/regles"
import {
  annulerExecutionsEnCours,
  MOTIF_ANNULATION,
  ouvrirExecution,
  ouvrirReessai,
  terminerExecution,
} from "@/lib/automations/executions"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-10-28T07:00:00.000Z")

async function creerEvenement(
  type = "commande.statut.changee",
  entityType = "commande",
  entityId = `entite-${runId}`,
  expiresAt?: Date
): Promise<{ id: string; type: string }> {
  const event = await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: type as never,
      entityType: entityType as never,
      entityId,
      payload: {},
      ...(expiresAt ? { expiresAt } : {}),
    })
  )
  return { id: event.id, type: event.type }
}

async function regleStatut() {
  const ligne = await prisma.automationRule.findUniqueOrThrow({
    where: { id: "statut-commande" },
  })
  return { id: ligne.id, action: ligne.action }
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
  it("crée la première tentative à 1", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const resultat = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    expect(resultat.attempt).toBe(1)
    const ligne = await prisma.automationRun.findUniqueOrThrow({
      where: { id: resultat.id },
    })
    expect(ligne.status).toBe("en_cours")
    expect(ligne.trigger).toBe("evenement")
  })

  it("suit un terminal par max(attempt) + 1", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const premier = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    await terminerExecution({
      executionId: premier.id,
      issue: "reussi",
      maintenant: MAINTENANT,
    })
    const second = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    expect(second.attempt).toBe(2)
  })

  it("reprend une tentative en_cours avec le même numéro et un startedAt frais", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const premier = await ouvrirExecution({
      evenement,
      regle,
      maintenant: new Date(MAINTENANT.getTime() - 5_000),
    })
    const repris = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    expect(repris.id).toBe(premier.id)
    expect(repris.attempt).toBe(1)
    const ligne = await prisma.automationRun.findUniqueOrThrow({
      where: { id: repris.id },
    })
    expect(ligne.startedAt.getTime()).toBe(MAINTENANT.getTime())
    expect(ligne.finishedAt).toBeNull()
    expect(ligne.lastError).toBeNull()
    expect(ligne.durationMs).toBeNull()
  })

  it("dérive le déclencheur : planification.* -> planification", async () => {
    const planif = await creerEvenement(
      "planification.digest-stock-bas",
      "planification"
    )
    const regle = await regleStatut()
    const res = await ouvrirExecution({
      evenement: planif,
      regle,
      maintenant: MAINTENANT,
    })
    const ligne = await prisma.automationRun.findUniqueOrThrow({
      where: { id: res.id },
    })
    expect(ligne.trigger).toBe("planification")
  })

  it("ne réécrit pas un déclencheur manuel lors d'une reprise", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const manuel = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "en_cours",
        attempt: 1,
        startedAt: new Date(MAINTENANT.getTime() - 1_000),
        trigger: "manuel",
      },
    })
    const repris = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    expect(repris.id).toBe(manuel.id)
    const ligne = await prisma.automationRun.findUniqueOrThrow({
      where: { id: repris.id },
    })
    expect(ligne.trigger).toBe("manuel")
  })

  it("suit le maximum après une ligne insérée manuellement", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 5,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const res = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    expect(res.attempt).toBe(6)
  })
})

describe("terminerExecution", () => {
  it("dérive durationMs depuis startedAt, jamais sous zéro", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const ouvert = await ouvrirExecution({
      evenement,
      regle,
      maintenant: new Date(MAINTENANT.getTime() - 5_000),
    })
    await terminerExecution({
      executionId: ouvert.id,
      issue: "reussi",
      maintenant: MAINTENANT,
    })
    const ligne = await prisma.automationRun.findUniqueOrThrow({
      where: { id: ouvert.id },
    })
    expect(ligne.durationMs).toBe(5_000)
    expect(ligne.finishedAt?.getTime()).toBe(MAINTENANT.getTime())
    expect(ligne.lastError).toBeNull()
  })

  it("lastError est le motif pour echoue et ignore, null pour reussi", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const a = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    await terminerExecution({
      executionId: a.id,
      issue: "echoue",
      erreur: "boom",
      maintenant: MAINTENANT,
    })
    const la = await prisma.automationRun.findUniqueOrThrow({
      where: { id: a.id },
    })
    expect(la.lastError).toBe("boom")

    const b = await ouvrirExecution({
      evenement,
      regle,
      maintenant: MAINTENANT,
    })
    await terminerExecution({
      executionId: b.id,
      issue: "ignore",
      erreur: MOTIF_ANNULATION,
      maintenant: MAINTENANT,
    })
    const lb = await prisma.automationRun.findUniqueOrThrow({
      where: { id: b.id },
    })
    expect(lb.lastError).toBe(MOTIF_ANNULATION)
  })

  it("une écriture terminale après annulation l'emporte", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const ouvert = await ouvrirExecution({
      evenement,
      regle,
      maintenant: new Date(MAINTENANT.getTime() - 5_000),
    })
    await prisma.$transaction((tx) =>
      annulerExecutionsEnCours({
        regleId: regle.id,
        maintenant: MAINTENANT,
        client: tx,
      })
    )
    await terminerExecution({
      executionId: ouvert.id,
      issue: "reussi",
      maintenant: MAINTENANT,
    })
    const ligne = await prisma.automationRun.findUniqueOrThrow({
      where: { id: ouvert.id },
    })
    expect(ligne.status).toBe("reussi")
  })

  it("lève si l'id est absent", async () => {
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
  it("ne change que les lignes en_cours de la règle, avec motif et durée propres", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const run = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "en_cours",
        attempt: 1,
        startedAt: new Date(MAINTENANT.getTime() - 5_000),
        trigger: "evenement",
      },
    })
    await prisma.$transaction((tx) =>
      annulerExecutionsEnCours({
        regleId: regle.id,
        maintenant: MAINTENANT,
        client: tx,
      })
    )
    const annulee = await prisma.automationRun.findUniqueOrThrow({
      where: { id: run.id },
    })
    expect(annulee.status).toBe("ignore")
    expect(annulee.lastError).toBe(MOTIF_ANNULATION)
    expect(annulee.durationMs).toBe(5_000)
  })

  it("ne libère le bail que si l'événement est encore en_cours", async () => {
    const evenement = await creerEvenement()
    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: {
        status: "en_cours",
        lockedUntil: new Date(MAINTENANT.getTime() + 60_000),
      },
    })
    const regle = await regleStatut()
    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "en_cours",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    await prisma.$transaction((tx) =>
      annulerExecutionsEnCours({
        regleId: regle.id,
        maintenant: MAINTENANT,
        client: tx,
      })
    )
    const libere = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(libere.lockedUntil).toBeNull()
  })

  it("laisse une autre règle intacte", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const autreRegleId = "confirmation-commande"
    const runAutre = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: autreRegleId,
        action: "email.commande-creee",
        status: "en_cours",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    await prisma.$transaction((tx) =>
      annulerExecutionsEnCours({
        regleId: regle.id,
        maintenant: MAINTENANT,
        client: tx,
      })
    )
    const intact = await prisma.automationRun.findUniqueOrThrow({
      where: { id: runAutre.id },
    })
    expect(intact.status).toBe("en_cours")
  })
})

describe("ouvrirReessai", () => {
  it("refuse dans l'ordre", async () => {
    const regle = await regleStatut()
    const r1 = await ouvrirReessai("inexistant", {
      maintenant: MAINTENANT,
    })
    expect(r1).toMatchObject({ ok: false, raison: "introuvable" })

    const evenement = await creerEvenement()
    const runReussi = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "reussi",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const r2 = await ouvrirReessai(runReussi.id, { maintenant: MAINTENANT })
    expect(r2).toMatchObject({ ok: false, raison: "pas-en-echec" })

    const runSansEvent = await prisma.automationRun.create({
      data: {
        eventId: null,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const r3 = await ouvrirReessai(runSansEvent.id, { maintenant: MAINTENANT })
    expect(r3).toMatchObject({ ok: false, raison: "evenement-disparu" })

    const runSansRegle = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: null,
        action: regle.action,
        status: "echoue",
        attempt: 2,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const r4 = await ouvrirReessai(runSansRegle.id, { maintenant: MAINTENANT })
    expect(r4).toMatchObject({ ok: false, raison: "regle-disparue" })

    const expireEvent = await creerEvenement(
      "commande.statut.changee",
      "commande",
      `expire-${runId}`,
      new Date(MAINTENANT.getTime() - 1_000)
    )
    const runExpire = await prisma.automationRun.create({
      data: {
        eventId: expireEvent.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const r5 = await ouvrirReessai(runExpire.id, { maintenant: MAINTENANT })
    expect(r5).toMatchObject({ ok: false, raison: "expire" })
  })

  it("crée la tentative manuelle à max(attempt) + 1", async () => {
    const evenement = await creerEvenement()
    const regle = await regleStatut()
    const run = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 3,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const res = await ouvrirReessai(run.id, { maintenant: MAINTENANT })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const ligne = await prisma.automationRun.findUniqueOrThrow({
        where: { id: res.execution.id },
      })
      expect(ligne.attempt).toBe(4)
      expect(ligne.trigger).toBe("manuel")
      expect(ligne.status).toBe("en_cours")
      expect(res.evenement.id).toBe(evenement.id)
      expect(res.regle.id).toBe(regle.id)
    }
  })

  it("un événement expiré n'écrit rien", async () => {
    const expireEvent = await creerEvenement(
      "commande.statut.changee",
      "commande",
      `expire2-${runId}`,
      new Date(MAINTENANT.getTime() - 1_000)
    )
    const regle = await regleStatut()
    const run = await prisma.automationRun.create({
      data: {
        eventId: expireEvent.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const avant = await prisma.automationRun.count({
      where: { eventId: expireEvent.id },
    })
    const res = await ouvrirReessai(run.id, { maintenant: MAINTENANT })
    expect(res).toMatchObject({ ok: false, raison: "expire" })
    const apres = await prisma.automationRun.count({
      where: { eventId: expireEvent.id },
    })
    expect(apres).toBe(avant)
  })
})

describe("réparation", () => {
  it("un succès manuel retourne l'événement reussi si aucun sibling n'a échoué", async () => {
    const evenement = await creerEvenement()
    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "echoue" },
    })
    const regle = await regleStatut()
    const run = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "manuel",
      },
    })
    const ouvert = await ouvrirReessai(run.id, { maintenant: MAINTENANT })
    expect(ouvert.ok).toBe(true)
    if (ouvert.ok) {
      await terminerExecution({
        executionId: ouvert.execution.id,
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

  it("un échec manuel n'écrit rien sur l'événement", async () => {
    const evenement = await creerEvenement()
    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "echoue" },
    })
    const regle = await regleStatut()
    const run = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "manuel",
      },
    })
    const ouvert = await ouvrirReessai(run.id, { maintenant: MAINTENANT })
    if (ouvert.ok) {
      await terminerExecution({
        executionId: ouvert.execution.id,
        issue: "echoue",
        erreur: "boom",
        maintenant: MAINTENANT,
      })
    }
    const ev = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(ev.status).toBe("echoue")
  })

  it("un succès avec un sibling en échec laisse l'événement en échec", async () => {
    const evenement = await creerEvenement()
    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: { status: "echoue" },
    })
    const regle = await regleStatut()
    const autreRegleId = "confirmation-commande"
    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: autreRegleId,
        action: "email.commande-creee",
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "evenement",
      },
    })
    const run = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "echoue",
        attempt: 1,
        startedAt: MAINTENANT,
        trigger: "manuel",
      },
    })
    const ouvert = await ouvrirReessai(run.id, { maintenant: MAINTENANT })
    if (ouvert.ok) {
      await terminerExecution({
        executionId: ouvert.execution.id,
        issue: "reussi",
        maintenant: MAINTENANT,
      })
    }
    const ev = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(ev.status).toBe("echoue")
  })
})
