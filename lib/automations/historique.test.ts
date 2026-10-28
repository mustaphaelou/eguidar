import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  compterExecutionsEnEchec,
  listerExecutions,
} from "@/lib/automations/historique"
import type { StatutAutomation } from "@/lib/generated/prisma/client"

const runId = randomUUID().slice(0, 8)
const JOUR = new Date("2026-10-28T00:00:00.000Z")

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

async function creerRegle(suffixe: string): Promise<string> {
  const id = `regle-${runId}-${suffixe}`
  await prisma.automationRule.create({
    data: {
      id,
      name: `Règle ${suffixe}`,
      trigger: "structure.modifiee",
      condition: { type: "toujours" },
      action: "invalidation.structure",
    },
  })
  return id
}

async function creerExecution(options: {
  regleId: string
  statut: StatutAutomation
  debut: Date
  erreur?: string
  tentative?: number
}): Promise<string> {
  const execution = await prisma.automationRun.create({
    data: {
      ruleId: options.regleId,
      action: "invalidation.structure",
      status: options.statut,
      attempt: options.tentative ?? 1,
      startedAt: options.debut,
      finishedAt: new Date(options.debut.getTime() + 500),
      lastError: options.erreur ?? null,
    },
  })
  return execution.id
}

describe("la lecture de l'historique des exécutions", () => {
  it("rend le statut, la tentative, l'erreur, les horodatages et la règle", async () => {
    const regleId = await creerRegle("lecture")
    const executionId = await creerExecution({
      regleId,
      statut: "echoue",
      debut: JOUR,
      erreur: "cache indisponible",
      tentative: 2,
    })

    const [execution] = await listerExecutions()
    expect(execution).toMatchObject({
      id: executionId,
      regleId,
      regle: "Règle lecture",
      action: "invalidation.structure",
      statut: "echoue",
      tentative: 2,
      erreur: "cache indisponible",
      declencheur: "evenement",
    })
    expect(execution!.debut).toEqual(JOUR)
    expect(execution!.fin).toBeInstanceOf(Date)
  })

  it("filtre par statut, par règle et par date de départ", async () => {
    const premiere = await creerRegle("premiere")
    const seconde = await creerRegle("seconde")
    await creerExecution({ regleId: premiere, statut: "reussi", debut: JOUR })
    await creerExecution({
      regleId: premiere,
      statut: "echoue",
      debut: new Date(JOUR.getTime() + 86_400_000),
    })
    await creerExecution({
      regleId: seconde,
      statut: "echoue",
      debut: new Date(JOUR.getTime() + 2 * 86_400_000),
    })

    const enEchec = await listerExecutions({ statut: "echoue" })
    expect(enEchec).toHaveLength(2)
    expect(enEchec.every((execution) => execution.statut === "echoue")).toBe(
      true
    )

    const deLaPremiere = await listerExecutions({ regleId: premiere })
    expect(deLaPremiere).toHaveLength(2)
    expect(
      deLaPremiere.every((execution) => execution.regleId === premiere)
    ).toBe(true)

    const recentes = await listerExecutions({
      depuis: new Date(JOUR.getTime() + 86_400_000),
    })
    expect(recentes).toHaveLength(2)
    expect(recentes[0]!.debut.getTime()).toBeGreaterThan(
      recentes[1]!.debut.getTime()
    )

    const combinees = await listerExecutions({
      statut: "echoue",
      regleId: premiere,
      depuis: new Date(JOUR.getTime() + 86_400_000),
    })
    expect(combinees).toHaveLength(1)
    expect(combinees[0]!.regleId).toBe(premiere)
  })

  it("compte les exécutions en échec ou en file morte", async () => {
    const regleId = await creerRegle("compte")
    await creerExecution({ regleId, statut: "reussi", debut: JOUR })
    await creerExecution({ regleId, statut: "echoue", debut: JOUR })
    await creerExecution({ regleId, statut: "mort", debut: JOUR })

    await expect(compterExecutionsEnEchec()).resolves.toBe(2)
  })
})
