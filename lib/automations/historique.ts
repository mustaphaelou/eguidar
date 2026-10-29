import { prisma } from "@/lib/db"
import type {
  DeclencheurExecution,
  StatutAutomation,
} from "@/lib/generated/prisma/client"

export interface ExecutionAutomatisation {
  id: string
  regleId: string | null
  regle: string | null
  action: string
  statut: StatutAutomation
  tentative: number
  erreur: string | null
  debut: Date
  fin: Date | null
  dureeMs: number | null
  declencheur: DeclencheurExecution
  evenement: {
    type: string
    entityType: string
    entityId: string
  } | null
}

export interface FiltresHistorique {
  statut?: StatutAutomation | null
  regleId?: string | null
  depuis?: Date | null
  limite?: number
}

/**
 * La lecture de l'historique : statut, tentative, erreur, horodatages, avec
 * les filtres de Flow (statut, règle, fenêtre de temps). Une exécution en
 * échec doit rester visible et réessayable dans l'Administration (ADR-0041).
 */
export async function listerExecutions(
  filtres: FiltresHistorique = {}
): Promise<ExecutionAutomatisation[]> {
  const executions = await prisma.automationRun.findMany({
    where: {
      ...(filtres.statut ? { status: filtres.statut } : {}),
      ...(filtres.regleId ? { ruleId: filtres.regleId } : {}),
      ...(filtres.depuis ? { startedAt: { gte: filtres.depuis } } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: filtres.limite ?? 25,
    include: {
      rule: { select: { name: true } },
      event: { select: { type: true, entityType: true, entityId: true } },
    },
  })

  return executions.map((execution) => ({
    id: execution.id,
    regleId: execution.ruleId,
    regle: execution.rule?.name ?? null,
    action: execution.action,
    statut: execution.status,
    tentative: execution.attempt,
    erreur: execution.lastError,
    debut: execution.startedAt,
    fin: execution.finishedAt,
    dureeMs: execution.durationMs,
    declencheur: execution.trigger,
    evenement: execution.event,
  }))
}

/** Le bandeau de l'Administration : un échec ne reste pas invisible. */
export async function compterExecutionsEnEchec(): Promise<number> {
  return prisma.automationRun.count({
    where: { status: { in: ["echoue", "mort"] } },
  })
}
