import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { enregistrerEvenement } from "@/lib/automations/evenements"
import { executerLesEvenements } from "@/lib/automations/executeur"
import { semerLesRegles } from "@/lib/automations/regles"
import { prisma } from "@/lib/db"
import {
  creerPortCatalogueMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const MAINTENANT = new Date("2026-10-28T07:00:00.000Z")
const REGLE = "invalidation-structure"

function options(maintenant = MAINTENANT, delaiDeReprise = () => 0) {
  return { maintenant, delaiDeReprise }
}

async function ecrireEvenement(categorieId: string) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "structure.creee",
      entityType: "categorie",
      entityId: categorieId,
      occurredAt: MAINTENANT,
      payload: { categorieId },
    })
  )
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

describe("l'action invalidation.structure", () => {
  it("invalide le cache et purge le bord en une seule conséquence", async () => {
    const categorieId = randomUUID()
    await ecrireEvenement(categorieId)

    const catalogue = creerPortCatalogueMemoire()
    const bilan = await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { catalogue: catalogue.port })
    )

    expect(bilan.reussis).toBe(1)
    expect(catalogue.structures).toBe(1)
    expect(catalogue.purges).toEqual([{ kind: "tout" }])
    const execution = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE, attempt: 1 },
    })
    expect(execution).toMatchObject({ status: "reussi", lastError: null })
  })

  it("une purge ratée laisse une Exécution échouée, puis le réessai repurge", async () => {
    const categorieId = randomUUID()
    await ecrireEvenement(categorieId)
    const panne = new Error("Cloudflare indisponible")

    const enPanne = creerPortCatalogueMemoire({ pannePurge: panne })
    const premier = await executerLesEvenements(
      options(MAINTENANT, () => 60_000),
      dependancesDeTest(MAINTENANT, { catalogue: enPanne.port })
    )

    expect(premier.echoues).toBe(1)
    expect(enPanne.structures).toBe(1)
    expect(enPanne.purges).toHaveLength(1)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: categorieId },
    })
    expect(evenement.status).toBe("en_attente")
    const echec = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE, attempt: 1 },
    })
    expect(echec).toMatchObject({
      status: "echoue",
      lastError: "Cloudflare indisponible",
    })

    const plusTard = new Date(MAINTENANT.getTime() + 60_001)
    const sain = creerPortCatalogueMemoire()
    await executerLesEvenements(
      options(plusTard, () => 0),
      dependancesDeTest(plusTard, { catalogue: sain.port })
    )

    expect(sain.structures).toBe(1)
    expect(sain.purges).toEqual([{ kind: "tout" }])
    const reussite = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE, attempt: 2 },
    })
    expect(reussite).toMatchObject({ status: "reussi", lastError: null })
  })
})
