import { PgBoss } from "pg-boss"

import { dependancesAutomations } from "@/lib/automations/dependances"
import {
  executerLesEvenements,
  type BilanExecution,
} from "@/lib/automations/executeur"
import {
  HEURE_DIGEST_STOCK_BAS,
  HEURE_RECONCILIATION,
  planifierLaReconciliation,
  planifierLeDigestStockBas,
} from "@/lib/automations/planification"
import { semerLesRegles } from "@/lib/automations/regles"
import { prunerLesExecutions } from "@/lib/automations/retention"

/**
 * Le travailleur tient sur le Postgres déjà déployé : pg-boss n'ajoute ni
 * Redis, ni second conteneur (ADR-0044). La file porte des **balayages** ;
 * l'unité durable est l'événement de `AutomationEvent`, réclamé en
 * `FOR UPDATE SKIP LOCKED` par l'exécuteur.
 */
export const FILE_BALAYAGE = "automations"
export const FILE_MORTS = "automations-morts"
export const FILE_PLANIFICATION_DIGEST = "automations-digest"
export const FILE_PLANIFICATION_RECONCILIATION = "automations-reconciliation"

export const SCHEMA_PG_BOSS_PAR_DEFAUT = "pgboss"
export const FUSEAU_PAR_DEFAUT = "Africa/Casablanca"

const globalPourAutomations = globalThis as unknown as {
  pgBossAutomations?: PgBoss
}

async function assurerLesFiles(boss: PgBoss): Promise<void> {
  await boss.createQueue(FILE_MORTS, {})
  await boss.createQueue(FILE_BALAYAGE, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120,
    deadLetter: FILE_MORTS,
  })
  await boss.createQueue(FILE_PLANIFICATION_DIGEST, {
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: FILE_MORTS,
  })
  await boss.createQueue(FILE_PLANIFICATION_RECONCILIATION, {
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: FILE_MORTS,
  })
}

export async function balayer(maintenant: Date): Promise<BilanExecution> {
  await prunerLesExecutions(maintenant)
  return executerLesEvenements(
    { maintenant },
    dependancesAutomations(maintenant)
  )
}

/**
 * Démarre le travailleur et ses horaires. Appelé depuis
 * `instrumentation.register` — jamais attendu par Next : la boucle vit dans le
 * processus et plusieurs réplicas peuvent la lancer, `SKIP LOCKED` les
 * départage.
 */
export async function demarrerLesAutomations(): Promise<PgBoss | null> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return null
  if (globalPourAutomations.pgBossAutomations) {
    return globalPourAutomations.pgBossAutomations
  }

  const boss = new PgBoss({
    connectionString,
    schema: process.env.PGBOSS_SCHEMA ?? SCHEMA_PG_BOSS_PAR_DEFAUT,
    supervise: true,
    schedule: true,
  })
  boss.on("error", (error: unknown) =>
    console.warn("[automations] pg-boss", error)
  )
  await boss.start()
  await assurerLesFiles(boss)
  await semerLesRegles()

  await boss.work(FILE_BALAYAGE, async () => {
    await balayer(new Date())
  })
  await boss.work(FILE_PLANIFICATION_DIGEST, async () => {
    const maintenant = new Date()
    await planifierLeDigestStockBas(maintenant)
    await balayer(maintenant)
  })
  await boss.work(FILE_PLANIFICATION_RECONCILIATION, async () => {
    const maintenant = new Date()
    await planifierLaReconciliation(maintenant)
    await balayer(maintenant)
  })

  await boss.schedule(FILE_BALAYAGE, "* * * * *", null, {
    tz: FUSEAU_PAR_DEFAUT,
  })
  await boss.schedule(
    FILE_PLANIFICATION_DIGEST,
    `0 ${HEURE_DIGEST_STOCK_BAS} * * *`,
    null,
    { tz: FUSEAU_PAR_DEFAUT }
  )
  await boss.schedule(
    FILE_PLANIFICATION_RECONCILIATION,
    `0 ${HEURE_RECONCILIATION} * * *`,
    null,
    { tz: FUSEAU_PAR_DEFAUT }
  )

  globalPourAutomations.pgBossAutomations = boss
  return boss
}

export async function arreterLesAutomations(): Promise<void> {
  const boss = globalPourAutomations.pgBossAutomations
  if (!boss) return
  globalPourAutomations.pgBossAutomations = undefined
  await boss.stop()
}
