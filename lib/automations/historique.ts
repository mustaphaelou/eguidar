import { prisma } from "@/lib/db"
import type {
  DeclencheurExecution,
  StatutAutomation,
} from "@/lib/generated/prisma/client"

export interface ExecutionAutomatisation {
  id: string
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

/**
 * La lecture minimale de l'historique : les dernières exécutions, avec leur
 * statut, leur tentative, leur erreur et leurs horodatages. Un échec doit être
 * visible dans l'Administration (ADR-0041) ; Phase 5 étendra la surface.
 */
export async function listerExecutions(
  options: { limite?: number } = {}
): Promise<ExecutionAutomatisation[]> {
  const executions = await prisma.automationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: options.limite ?? 25,
    include: {
      rule: { select: { name: true } },
      event: { select: { type: true, entityType: true, entityId: true } },
    },
  })

  return executions.map((execution) => ({
    id: execution.id,
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
