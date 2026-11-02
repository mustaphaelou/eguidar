import { Prisma } from "@/lib/generated/prisma/client"
import type {
  AutomationEvent,
  AutomationRun,
} from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { versRegle, type RegleAutomation } from "@/lib/automations/regles"

export type IssueExecution = "reussi" | "echoue" | "ignore"

export type RefusReessai =
  | "introuvable"
  | "pas-en-echec"
  | "evenement-disparu"
  | "regle-disparue"
  | "expire"

export const MOTIF_ANNULATION = "annulée : règle désactivée"

function declencheurDe(type: string): "evenement" | "planification" | "manuel" {
  return type.startsWith("planification.") ? "planification" : "evenement"
}

async function avecClient<T>(
  client: Prisma.TransactionClient | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (client) return fn(client)
  return prisma.$transaction((tx) => fn(tx))
}

// --- ouvrirExecution ---

export async function ouvrirExecution(options: {
  evenement: { id: string; type: string }
  regle: { id: string; action: string }
  maintenant: Date
  client?: Prisma.TransactionClient
}): Promise<{ id: string; attempt: number }> {
  const { evenement, regle, maintenant, client } = options

  return avecClient(client, async (tx) => {
    const dernier = await tx.automationRun.findFirst({
      where: { eventId: evenement.id, ruleId: regle.id },
      orderBy: { attempt: "desc" },
    })

    if (dernier && dernier.status === "en_cours") {
      const misAJour = await tx.automationRun.update({
        where: { id: dernier.id },
        data: {
          status: "en_cours",
          action: regle.action,
          startedAt: maintenant,
          finishedAt: null,
          lastError: null,
          durationMs: null,
        },
      })
      return { id: misAJour.id, attempt: misAJour.attempt }
    }

    const attempt = (dernier?.attempt ?? 0) + 1

    try {
      const cree = await tx.automationRun.create({
        data: {
          eventId: evenement.id,
          ruleId: regle.id,
          action: regle.action,
          status: "en_cours",
          attempt,
          startedAt: maintenant,
          trigger: declencheurDe(evenement.type),
        },
      })
      return { id: cree.id, attempt: cree.attempt }
    } catch (error) {
      if (hasUniqueViolation(error, ["eventId", "ruleId", "attempt"])) {
        const agregat = await tx.automationRun.aggregate({
          where: { eventId: evenement.id, ruleId: regle.id },
          _max: { attempt: true },
        })
        const nouvelAttempt = (agregat._max.attempt ?? 0) + 1
        const cree = await tx.automationRun.create({
          data: {
            eventId: evenement.id,
            ruleId: regle.id,
            action: regle.action,
            status: "en_cours",
            attempt: nouvelAttempt,
            startedAt: maintenant,
            trigger: declencheurDe(evenement.type),
          },
        })
        return { id: cree.id, attempt: cree.attempt }
      }
      throw error
    }
  })
}

// --- private terminal writer ---

async function ecrireTerminal(
  tx: Prisma.TransactionClient,
  executionId: string,
  statut: IssueExecution,
  maintenant: Date,
  erreur: string | null,
  startedAt: Date
): Promise<void> {
  await tx.automationRun.update({
    where: { id: executionId },
    data: {
      status: statut,
      finishedAt: maintenant,
      durationMs: Math.max(0, maintenant.getTime() - startedAt.getTime()),
      lastError: erreur,
    },
  })
}

// --- plusAucuneRegleEnEchec ---

async function plusAucuneRegleEnEchec(
  tx: Prisma.TransactionClient,
  eventId: string,
  regleReessayee: string
): Promise<boolean> {
  const executions = await tx.automationRun.findMany({
    where: { eventId },
    orderBy: { startedAt: "desc" },
    select: { ruleId: true, status: true },
  })
  const derniereParRegle = new Map<string, string>()
  for (const execution of executions) {
    if (!execution.ruleId) continue
    if (derniereParRegle.has(execution.ruleId)) continue
    derniereParRegle.set(execution.ruleId, execution.status)
  }
  return [...derniereParRegle.entries()].every(
    ([ruleId, statut]) => ruleId === regleReessayee || statut !== "echoue"
  )
}

// --- terminerExecution ---

export async function terminerExecution(options: {
  executionId: string
  issue: IssueExecution
  erreur?: string
  maintenant: Date
  client?: Prisma.TransactionClient
}): Promise<void> {
  const { executionId, issue, erreur, maintenant, client } = options

  await avecClient(client, async (tx) => {
    const execution = await tx.automationRun.findUniqueOrThrow({
      where: { id: executionId },
    })

    const lastError = issue === "reussi" ? null : (erreur ?? null)

    await ecrireTerminal(
      tx,
      executionId,
      issue,
      maintenant,
      lastError,
      execution.startedAt
    )

    // terminal aftermath: repair on manual success
    if (
      issue === "reussi" &&
      execution.trigger === "manuel" &&
      execution.eventId
    ) {
      const ok = await plusAucuneRegleEnEchec(
        tx,
        execution.eventId,
        execution.ruleId ?? ""
      )
      if (ok) {
        await tx.automationEvent.updateMany({
          where: { id: execution.eventId },
          data: { status: "reussi", lastError: null, lockedUntil: null },
        })
      }
    }
  })
}

// --- annulerExecutionsEnCours ---

export async function annulerExecutionsEnCours(options: {
  regleId: string
  maintenant: Date
  client: Prisma.TransactionClient
}): Promise<void> {
  const { regleId, maintenant, client } = options
  const tx = client

  const executions = await tx.automationRun.findMany({
    where: { ruleId: regleId, status: "en_cours" },
    select: { id: true, startedAt: true, eventId: true },
  })

  for (const execution of executions) {
    await ecrireTerminal(
      tx,
      execution.id,
      "ignore",
      maintenant,
      MOTIF_ANNULATION,
      execution.startedAt
    )
  }

  const evenements = [
    ...new Set(
      executions
        .map((execution) => execution.eventId)
        .filter((eventId): eventId is string => eventId !== null)
    ),
  ]
  if (evenements.length > 0) {
    await tx.automationEvent.updateMany({
      where: { id: { in: evenements }, status: "en_cours" },
      data: { lockedUntil: null },
    })
  }
}

// --- ouvrirReessai ---

export async function ouvrirReessai(
  executionId: string,
  options: { maintenant: Date; client?: Prisma.TransactionClient }
): Promise<
  | {
      ok: true
      execution: { id: string }
      evenement: AutomationEvent
      regle: RegleAutomation
    }
  | { ok: false; raison: RefusReessai }
> {
  const { maintenant, client } = options

  return avecClient(client, async (tx) => {
    const execution = await tx.automationRun.findUnique({
      where: { id: executionId },
      include: { event: true, rule: true },
    })

    if (!execution) return { ok: false, raison: "introuvable" }
    if (execution.status !== "echoue")
      return { ok: false, raison: "pas-en-echec" }
    if (!execution.event) return { ok: false, raison: "evenement-disparu" }
    if (!execution.rule) return { ok: false, raison: "regle-disparue" }

    const evenement = execution.event
    if (evenement.expiresAt.getTime() <= maintenant.getTime()) {
      return { ok: false, raison: "expire" }
    }

    const regle = versRegle(execution.rule)

    const agregat = await tx.automationRun.aggregate({
      where: { eventId: evenement.id, ruleId: regle.id },
      _max: { attempt: true },
    })
    const attempt = (agregat._max.attempt ?? 0) + 1

    let cree: AutomationRun
    try {
      cree = await tx.automationRun.create({
        data: {
          eventId: evenement.id,
          ruleId: regle.id,
          action: regle.action,
          status: "en_cours",
          attempt,
          startedAt: maintenant,
          trigger: "manuel",
        },
      })
    } catch (error) {
      if (hasUniqueViolation(error, ["eventId", "ruleId", "attempt"])) {
        const agregat2 = await tx.automationRun.aggregate({
          where: { eventId: evenement.id, ruleId: regle.id },
          _max: { attempt: true },
        })
        const nouvelAttempt = (agregat2._max.attempt ?? 0) + 1
        cree = await tx.automationRun.create({
          data: {
            eventId: evenement.id,
            ruleId: regle.id,
            action: regle.action,
            status: "en_cours",
            attempt: nouvelAttempt,
            startedAt: maintenant,
            trigger: "manuel",
          },
        })
      } else {
        throw error
      }
    }

    return {
      ok: true,
      execution: { id: cree.id },
      evenement,
      regle,
    }
  })
}
