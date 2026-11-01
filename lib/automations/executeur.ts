import { Prisma } from "@/lib/generated/prisma/client"
import type { AutomationEvent } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import {
  executerLAction,
  type DependancesAutomations,
} from "@/lib/automations/actions"
import {
  actionAutomationSchema,
  configurationRegleSchema,
  type ActionAutomation,
} from "@/lib/automations/regles"
import {
  typeEntiteAutomationSchema,
  typeEvenementAutomationSchema,
} from "@/lib/automations/evenements"
import {
  deciderAutomation,
  evenementEstExpire,
} from "@/lib/automations/decision"

export const LIMITE_PAR_BALAYAGE = 20
export const BAIL_EXECUTION_MS = 60_000
export const MAX_TENTATIVES = 3

/**
 * Le backoff est exponentiel, borné à une heure : 1 min, 2 min, 4 min… Une
 * panne passagère d'un fournisseur se répare sans noyer le journal.
 */
export function delaiDeRepriseMs(tentative: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, tentative - 1), 3_600_000)
}

export interface OptionsExecution {
  maintenant: Date
  limite?: number
  bailMs?: number
  maxTentatives?: number
  delaiDeReprise?: (tentative: number) => number
  maxPasses?: number
}

export interface BilanExecution {
  traites: number
  reussis: number
  echoues: number
  ignores: number
}

function messageDeLErreur(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * La réclamation est un `SELECT … FOR UPDATE SKIP LOCKED` sur la **tête** de
 * chaque entité : deux travailleurs concurrents se partagent les entités sans
 * jamais attendre ni exécuter deux fois le même événement. Le verrou est tenu
 * le temps de la transaction seulement ; l'exécution, elle, est protégée par
 * `status = en_cours` et un bail (`lockedUntil`) qui expire si le processus
 * meurt — c'est ce qui rend le redémarrage possible.
 */
export async function reclamerLesIdentifiants(
  tx: Prisma.TransactionClient,
  options: OptionsExecution
): Promise<string[]> {
  const maintenant = options.maintenant
  const limite = options.limite ?? LIMITE_PAR_BALAYAGE

  const lignes = await tx.$queryRaw<{ id: string }[]>`
    SELECT e."id"
    FROM "AutomationEvent" AS e
    WHERE e."status"::text NOT IN ('reussi', 'ignore', 'mort')
      AND e."seq" = (
        SELECT MIN(e2."seq")
        FROM "AutomationEvent" AS e2
        WHERE e2."entityType" = e."entityType"
          AND e2."entityId" = e."entityId"
          AND e2."status"::text NOT IN ('reussi', 'ignore', 'mort')
      )
      AND e."availableAt" <= ${maintenant}
      AND (
        e."status"::text = 'en_attente'
        OR e."lockedUntil" IS NULL
        OR e."lockedUntil" < ${maintenant}
      )
    ORDER BY e."entityId" ASC, e."seq" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT ${limite}
  `
  return lignes.map((ligne) => ligne.id)
}

export async function reclamerEvenements(
  options: OptionsExecution
): Promise<AutomationEvent[]> {
  const bailMs = options.bailMs ?? BAIL_EXECUTION_MS

  return prisma.$transaction(async (tx) => {
    const ids = await reclamerLesIdentifiants(tx, options)
    if (ids.length === 0) return []

    await tx.automationEvent.updateMany({
      where: { id: { in: ids }, status: { in: ["en_attente", "en_cours"] } },
      data: {
        status: "en_cours",
        lockedUntil: new Date(options.maintenant.getTime() + bailMs),
      },
    })

    return tx.automationEvent.findMany({
      where: { id: { in: ids } },
      orderBy: [{ entityId: "asc" }, { seq: "asc" }],
    })
  })
}

interface OptionsRun {
  eventId: string
  ruleId: string
  action: string
  attempt: number
  trigger: "evenement" | "planification" | "manuel"
  maintenant: Date
}

async function demarrerRun(options: OptionsRun) {
  return prisma.automationRun.upsert({
    where: {
      eventId_ruleId_attempt: {
        eventId: options.eventId,
        ruleId: options.ruleId,
        attempt: options.attempt,
      },
    },
    create: {
      eventId: options.eventId,
      ruleId: options.ruleId,
      action: options.action,
      status: "en_cours",
      attempt: options.attempt,
      startedAt: options.maintenant,
      trigger: options.trigger,
    },
    update: {
      status: "en_cours",
      action: options.action,
      startedAt: options.maintenant,
      finishedAt: null,
      lastError: null,
      durationMs: null,
    },
  })
}

async function terminerRun(
  id: string,
  statut: "reussi" | "echoue" | "ignore",
  maintenant: Date,
  erreur?: string
) {
  const run = await prisma.automationRun.findUniqueOrThrow({ where: { id } })
  return prisma.automationRun.update({
    where: { id },
    data: {
      status: statut,
      finishedAt: maintenant,
      durationMs: Math.max(0, maintenant.getTime() - run.startedAt.getTime()),
      lastError: erreur ?? null,
    },
  })
}

function declencheurDe(type: string): OptionsRun["trigger"] {
  return type.startsWith("planification.") ? "planification" : "evenement"
}

async function ignorerEvenement(
  evenement: AutomationEvent,
  regles: { id: string; action: string }[],
  motif: string,
  maintenant: Date
): Promise<"ignore"> {
  for (const regle of regles) {
    const run = await demarrerRun({
      eventId: evenement.id,
      ruleId: regle.id,
      action: regle.action,
      attempt: evenement.attempts + 1,
      trigger: declencheurDe(evenement.type),
      maintenant,
    })
    await terminerRun(run.id, "ignore", maintenant, motif)
  }
  await prisma.automationEvent.update({
    where: { id: evenement.id },
    data: { status: "ignore", lockedUntil: null, lastError: motif },
  })
  return "ignore"
}

/**
 * Exécute un événement réclamé : la Décision d'automatisation juge chaque
 * couple « cette Règle, cet Événement », la requête gardant le filtre des
 * règles actives et de même déclencheur. L'expiration est jugée une fois pour
 * l'événement — un événement périmé est « ignoré », jamais « échoué ».
 */
export async function executerEvenement(
  evenement: AutomationEvent,
  options: OptionsExecution,
  dependances: DependancesAutomations
): Promise<"reussi" | "echoue" | "ignore"> {
  const maintenant = options.maintenant
  const maxTentatives = options.maxTentatives ?? MAX_TENTATIVES
  const delai = options.delaiDeReprise ?? delaiDeRepriseMs

  const regles = await prisma.automationRule.findMany({
    where: { enabled: true, trigger: evenement.type },
    orderBy: { id: "asc" },
    select: {
      id: true,
      trigger: true,
      enabled: true,
      action: true,
      condition: true,
      actionConfig: true,
    },
  })

  if (evenementEstExpire(evenement.expiresAt, maintenant)) {
    return ignorerEvenement(
      evenement,
      regles,
      `événement expiré le ${evenement.expiresAt.toISOString()}`,
      maintenant
    )
  }

  const tentative = evenement.attempts + 1
  const trigger = declencheurDe(evenement.type)
  let derniereErreur: string | null = null

  for (const regle of regles) {
    const decision = deciderAutomation(regle, evenement, maintenant)
    if (
      decision.decision === "ignorer" &&
      decision.raison.type !== "condition-non-remplie"
    ) {
      continue
    }

    const action: ActionAutomation = actionAutomationSchema.parse(regle.action)
    const configuration = configurationRegleSchema
      .optional()
      .parse(regle.actionConfig ?? undefined)
    const run = await demarrerRun({
      eventId: evenement.id,
      ruleId: regle.id,
      action: regle.action,
      attempt: tentative,
      trigger,
      maintenant,
    })

    if (decision.decision === "ignorer") {
      await terminerRun(run.id, "ignore", maintenant, "condition non remplie")
      continue
    }

    try {
      await executerLAction({
        evenement: {
          type: typeEvenementAutomationSchema.parse(evenement.type),
          entityType: typeEntiteAutomationSchema.parse(evenement.entityType),
          entityId: evenement.entityId,
          payload: evenement.payload,
        },
        regle: { id: regle.id, action, configuration },
        dependances,
      })
      await terminerRun(run.id, "reussi", maintenant)
    } catch (error) {
      derniereErreur = messageDeLErreur(error)
      await terminerRun(run.id, "echoue", maintenant, derniereErreur)
    }
  }

  if (derniereErreur !== null) {
    if (tentative >= maxTentatives) {
      await prisma.automationEvent.update({
        where: { id: evenement.id },
        data: {
          status: "mort",
          attempts: tentative,
          lastError: derniereErreur,
          lockedUntil: null,
        },
      })
      return "echoue"
    }
    await prisma.automationEvent.update({
      where: { id: evenement.id },
      data: {
        status: "en_attente",
        attempts: tentative,
        lastError: derniereErreur,
        lockedUntil: null,
        availableAt: new Date(maintenant.getTime() + delai(tentative)),
      },
    })
    return "echoue"
  }

  await prisma.automationEvent.update({
    where: { id: evenement.id },
    data: {
      status: "reussi",
      attempts: tentative,
      lastError: null,
      lockedUntil: null,
    },
  })
  return "reussi"
}

/**
 * Un balayage draine les têtes d'entité jusqu'à ce qu'il n'y ait plus rien de
 * réclamable. Il est appelé par le travailleur pg-boss ; plusieurs réplicas
 * peuvent le lancer en parallèle sans se marcher dessus.
 */
export async function executerLesEvenements(
  options: OptionsExecution,
  dependances: DependancesAutomations
): Promise<BilanExecution> {
  const bilan: BilanExecution = {
    traites: 0,
    reussis: 0,
    echoues: 0,
    ignores: 0,
  }

  const passes = options.maxPasses ?? 25
  for (let passe = 0; passe < passes; passe++) {
    const evenements = await reclamerEvenements(options)
    if (evenements.length === 0) break

    for (const evenement of evenements) {
      const resultat = await executerEvenement(evenement, options, dependances)
      bilan.traites += 1
      if (resultat === "reussi") bilan.reussis += 1
      else if (resultat === "echoue") bilan.echoues += 1
      else bilan.ignores += 1
    }
  }

  return bilan
}

/** Le renvoi manuel d'un événement mort (redrive) est une remise en attente. */
export async function redriveEvenementsMorts(limite = 100): Promise<number> {
  const morts = await prisma.automationEvent.findMany({
    where: { status: "mort" },
    orderBy: { updatedAt: "asc" },
    take: limite,
    select: { id: true },
  })
  if (morts.length === 0) return 0

  await prisma.automationEvent.updateMany({
    where: { id: { in: morts.map((mort) => mort.id) } },
    data: {
      status: "en_attente",
      attempts: 0,
      lastError: null,
      availableAt: new Date(),
      lockedUntil: null,
    },
  })
  return morts.length
}

export async function compterEvenementsMorts(): Promise<number> {
  return prisma.automationEvent.count({ where: { status: "mort" } })
}
