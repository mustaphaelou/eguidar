import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { dependancesAutomations } from "@/lib/automations/dependances"
import { enregistrerEvenement } from "@/lib/automations/evenements"
import { executerLesEvenements } from "@/lib/automations/executeur"
import { semerLesRegles } from "@/lib/automations/regles"
import { prisma } from "@/lib/db"

const MAINTENANT = new Date("2026-11-02T07:00:00.000Z")
const REGLE = "invalidation-structure-supprimee"

function options(maintenant = MAINTENANT, delaiDeReprise = () => 0) {
  return { maintenant, delaiDeReprise }
}

function reponsePurge(statut: number): Response {
  return new Response(
    JSON.stringify(
      statut === 200
        ? { success: true, errors: [] }
        : { success: false, errors: [{ message: "zone indisponible" }] }
    ),
    {
      status: statut,
      headers: { "content-type": "application/json" },
    }
  )
}

async function ecrireSuppression(categorieId: string) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "structure.supprimee",
      entityType: "categorie",
      entityId: categorieId,
      occurredAt: MAINTENANT,
      payload: {
        categorieId,
        image: null,
        destinations: [],
        produitsSansStructure: false,
      },
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

describe("l'invalidation durable d'une Structure supprimée", () => {
  it("réessaie le cache et le bord ensemble quand la purge échoue", async () => {
    const categorieId = randomUUID()
    await ecrireSuppression(categorieId)
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(reponsePurge(503))
    const zoneInitiale = process.env.CLOUDFLARE_ZONE_ID
    const jetonInitial = process.env.CLOUDFLARE_API_TOKEN
    process.env.CLOUDFLARE_ZONE_ID = "zone-test"
    process.env.CLOUDFLARE_API_TOKEN = "jeton-test"
    try {
      const delai = 60_000
      const premier = await executerLesEvenements(
        options(MAINTENANT, () => delai),
        dependancesAutomations(MAINTENANT)
      )

      expect(premier.echoues).toBe(1)
      const evenement = await prisma.automationEvent.findFirstOrThrow({
        where: { entityId: categorieId },
      })
      expect(evenement.status).toBe("en_attente")
      const echec = await prisma.automationRun.findFirstOrThrow({
        where: { ruleId: REGLE },
      })
      expect(echec.status).toBe("echoue")
      expect(echec.lastError).toContain("HTTP 503")

      fetchSpy.mockResolvedValue(reponsePurge(200))
      const plusTard = new Date(MAINTENANT.getTime() + delai + 1)
      const second = await executerLesEvenements(
        options(plusTard, () => 0),
        dependancesAutomations(plusTard)
      )

      expect(second.echoues).toBe(0)
      const executions = await prisma.automationRun.findMany({
        where: { ruleId: REGLE },
        orderBy: { attempt: "asc" },
      })
      expect(executions.map((execution) => execution.status)).toEqual([
        "echoue",
        "reussi",
      ])
    } finally {
      fetchSpy.mockRestore()
      if (zoneInitiale === undefined) delete process.env.CLOUDFLARE_ZONE_ID
      else process.env.CLOUDFLARE_ZONE_ID = zoneInitiale
      if (jetonInitial === undefined) delete process.env.CLOUDFLARE_API_TOKEN
      else process.env.CLOUDFLARE_API_TOKEN = jetonInitial
    }
  })
})
