import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"

import AdminAutomatisationsPage from "./page"

const runId = randomUUID().slice(0, 8)

function sansBalises(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function cellulesDeLaPremiereLigne(html: string): string[] {
  const corps = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? ""
  return [...corps.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cellule) =>
    sansBalises(cellule[1]!)
  )
}

async function rendreLaPage(): Promise<string> {
  const stream = await renderToReadableStream(<AdminAutomatisationsPage />)
  return new Response(stream).text()
}

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
})

afterAll(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.$disconnect()
})

describe("la page des automatisations", () => {
  it("invite à attendre la première exécution quand l'historique est vide", async () => {
    const html = await rendreLaPage()
    expect(html).toContain("Automatisations")
    expect(html).toContain("Aucune exécution")
  })

  it("montre une exécution en échec avec son erreur, sa tentative et ses horodatages", async () => {
    const regle = await prisma.automationRule.create({
      data: {
        id: `invalidation-${runId}`,
        name: "Invalidation de la Structure",
        trigger: "structure.modifiee",
        condition: { type: "toujours" },
        action: "invalidation.structure",
      },
    })
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "structure.modifiee",
        entityType: "categorie",
        entityId: `categorie-${runId}`,
        seq: 1,
        attemptOf: 1,
        payload: { categorieId: `categorie-${runId}` },
        occurredAt: new Date("2026-10-28T03:00:00.000Z"),
        expiresAt: new Date("2026-10-29T03:00:00.000Z"),
        status: "mort",
        attempts: 2,
        lastError: "cache indisponible",
      },
    })
    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: "invalidation.structure",
        status: "echoue",
        attempt: 2,
        lastError: "cache indisponible",
        startedAt: new Date("2026-10-28T03:00:00.000Z"),
        finishedAt: new Date("2026-10-28T03:00:01.000Z"),
        durationMs: 1000,
      },
    })

    const html = await rendreLaPage()
    expect(sansBalises(html)).toContain(
      "1 exécution(s) en échec ou en file morte."
    )
    const cellules = cellulesDeLaPremiereLigne(html)
    expect(cellules[0]).toBe("Échoué")
    expect(cellules[1]).toBe("Invalidation de la Structure")
    expect(cellules[2]).toContain("structure.modifiee")
    expect(cellules[2]).toContain(`categorie-${runId}`)
    expect(cellules[3]).toBe("2")
    expect(cellules[4]).toBe("cache indisponible")
    expect(cellules[5]).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(cellules[6]).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})
