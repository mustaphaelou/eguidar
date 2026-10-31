import { randomUUID } from "node:crypto"

import { PgBoss } from "pg-boss"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import { enregistrerEvenement } from "@/lib/automations/evenements"
import { balayer } from "@/lib/automations/file"
import { semerLesRegles } from "@/lib/automations/regles"

const SCHEMA = "pgboss_804_phase4_test"
const FILE = "essai-automations"
const MORTS = "essai-automations-morts"
const runId = randomUUID().slice(0, 8)

let boss: PgBoss

beforeAll(async () => {
  boss = new PgBoss({
    connectionString: process.env.TEST_DATABASE_URL,
    schema: SCHEMA,
    supervise: false,
    schedule: false,
  })
  await boss.start()
  await boss.createQueue(MORTS, {})
  await boss.createQueue(FILE, { retryLimit: 0, deadLetter: MORTS })
})

afterAll(async () => {
  await boss.stop()
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`)
  await prisma.$disconnect()
})

describe("pg-boss sur le Postgres déjà déployé", () => {
  it("transporte un travail sans Redis ni second conteneur", async () => {
    const id = await boss.send(FILE, { essai: runId })
    expect(id).toBeTruthy()

    const [travail] = await boss.fetch(FILE)
    expect(travail).toBeDefined()
    expect(travail!.data).toEqual({ essai: runId })
    await boss.complete(FILE, travail!.id)
  })

  it("laisse un travail épuisé dans la file morte, avec sa charge, et le renvoie", async () => {
    await boss.send(FILE, { essai: `mort-${runId}` })
    const [travail] = await boss.fetch(FILE)
    expect(travail).toBeDefined()
    await boss.fail(FILE, travail!.id, { erreur: "fournisseur indisponible" })

    const [mort] = await boss.fetch(MORTS)
    expect(mort).toBeDefined()
    expect(mort!.data).toMatchObject({ essai: `mort-${runId}` })
    await boss.complete(MORTS, mort!.id)

    await expect(boss.redrive(MORTS)).resolves.toBe(0)
  })

  it(
    "un travailleur pg-boss draine le carnet de sortie des automatisations",
    { timeout: 30_000 },
    async () => {
      await semerLesRegles()
      const entite = `categorie-${runId}-boucle`
      await prisma.$transaction((tx) =>
        enregistrerEvenement(tx, {
          type: "structure.modifiee",
          entityType: "categorie",
          entityId: entite,
          payload: { categorieId: entite },
        })
      )

      const travailleur = await boss.work(
        FILE,
        { pollingIntervalSeconds: 0.5 },
        async () => {
          await balayer(new Date())
        }
      )
      await boss.send(FILE, { balayage: true })

      await vi.waitFor(
        async () => {
          const evenement = await prisma.automationEvent.findFirstOrThrow({
            where: { entityId: entite },
          })
          expect(evenement.status).toBe("reussi")
        },
        { timeout: 10_000, interval: 250 }
      )

      await boss.offWork(FILE)
      expect(travailleur).toBeTruthy()
    }
  )
})
