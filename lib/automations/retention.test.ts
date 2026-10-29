import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { balayer } from "@/lib/automations/file"
import {
  DUREE_RETENTION_EXECUTIONS_MS,
  prunerLesExecutions,
} from "@/lib/automations/retention"
import type { StatutAutomation } from "@/lib/generated/prisma/client"

const MAINTENANT = new Date("2026-10-28T09:00:00.000Z")
const JOUR = 24 * 60 * 60 * 1000

async function balayerLesTables() {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
}

beforeEach(balayerLesTables)

afterAll(async () => {
  await balayerLesTables()
  await prisma.$disconnect()
})

async function creerExecution(options: {
  debut: Date
  statut?: StatutAutomation
}): Promise<string> {
  const execution = await prisma.automationRun.create({
    data: {
      action: "invalidation.structure",
      status: options.statut ?? "reussi",
      attempt: 1,
      startedAt: options.debut,
      finishedAt: new Date(options.debut.getTime() + 500),
    },
  })
  return execution.id
}

describe("la rétention de l'historique des exécutions", () => {
  it("garde la fenêtre documentée et purge ce qui la dépasse", async () => {
    const recente = await creerExecution({
      debut: new Date(MAINTENANT.getTime() - 13 * JOUR),
    })
    const justeAvantLaFenetre = await creerExecution({
      debut: new Date(
        MAINTENANT.getTime() - DUREE_RETENTION_EXECUTIONS_MS + 1_000
      ),
    })
    const perimee = await creerExecution({
      debut: new Date(MAINTENANT.getTime() - 15 * JOUR),
    })

    await expect(prunerLesExecutions(MAINTENANT)).resolves.toBe(1)

    const restantes = await prisma.automationRun.findMany({
      select: { id: true },
    })
    expect(restantes.map((execution) => execution.id).sort()).toEqual(
      [recente, justeAvantLaFenetre].sort()
    )
    await expect(
      prisma.automationRun.findUnique({ where: { id: perimee } })
    ).resolves.toBeNull()
  })

  it("ne purge jamais une exécution en cours, même ancienne", async () => {
    const enCours = await creerExecution({
      debut: new Date(MAINTENANT.getTime() - 30 * JOUR),
      statut: "en_cours",
    })

    await expect(prunerLesExecutions(MAINTENANT)).resolves.toBe(0)
    await expect(
      prisma.automationRun.findUnique({ where: { id: enCours } })
    ).resolves.not.toBeNull()
  })

  it("est purgée par le balayage du travailleur, pas par un second ordonnanceur", async () => {
    const perimee = await creerExecution({
      debut: new Date(MAINTENANT.getTime() - 15 * JOUR),
    })
    const recente = await creerExecution({
      debut: new Date(MAINTENANT.getTime() - JOUR),
    })

    await balayer(MAINTENANT)

    await expect(
      prisma.automationRun.findUnique({ where: { id: perimee } })
    ).resolves.toBeNull()
    await expect(
      prisma.automationRun.findUnique({ where: { id: recente } })
    ).resolves.not.toBeNull()
  })
})
