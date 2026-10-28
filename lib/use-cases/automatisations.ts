import { z } from "zod"

import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import { typeEvenementAutomationSchema } from "@/lib/automations/evenements"
import {
  conditionAutomationSchema,
  configurationRegleSchema,
  ecrireRevisionRegle,
  verifierRegle,
  type RegleAutomation,
} from "@/lib/automations/regles"
import type {
  ActionAutomation,
  ConfigurationRegle,
  TypeConditionAutomation,
} from "@/lib/automations/vocabulaire"
import type {
  DeclencheurExecution,
  StatutAutomation,
} from "@/lib/generated/prisma/client"
import { slugify } from "@/lib/slug"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export class RegleIntrouvableError extends UserFacingError {
  constructor() {
    super("Règle d'automatisation introuvable")
    this.name = "RegleIntrouvableError"
  }
}

export class IdentifiantRegleExisteError extends UserFacingError {
  constructor() {
    super("Une Règle d'automatisation avec cet identifiant existe déjà")
    this.name = "IdentifiantRegleExisteError"
  }
}

export class RegleValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "RegleValidationError"
  }
}

export const MOTIF_ANNULATION = "annulée : règle désactivée"

/** Ce que l'éditeur compose : les valeurs brutes du formulaire. */
export interface EntreeRegle {
  regleId?: string
  nom: string
  declencheur: string
  condition: { type: string; statuts?: string[] }
  action: string
  configuration?: { destinataireVariable?: string }
  actif: boolean
}

export interface ExecutionResumee {
  statut: StatutAutomation
  debut: Date
  declencheur: DeclencheurExecution
}

export interface RevisionRegle {
  id: string
  auteur: string
  horodatage: Date
  snapshot: unknown
}

export interface RegleListee extends RegleAutomation {
  derniereExecution: ExecutionResumee | null
}

export interface RegleDetaillee extends RegleListee {
  revisions: RevisionRegle[]
}

function conditionSaisie(condition: EntreeRegle["condition"]) {
  return condition.type === "statut-commande"
    ? { type: "statut-commande" as const, statuts: condition.statuts ?? [] }
    : { type: condition.type }
}

function configurationSaisie(
  configuration: EntreeRegle["configuration"]
): ConfigurationRegle | undefined {
  const variable = configuration?.destinataireVariable?.trim()
  return variable ? { destinataireVariable: variable } : undefined
}

function donneesDeLaRegle(
  id: string,
  entree: EntreeRegle
): Prisma.AutomationRuleUncheckedCreateInput {
  return {
    id,
    name: entree.nom,
    enabled: entree.actif,
    trigger: entree.declencheur,
    condition: conditionSaisie(entree.condition) as Prisma.InputJsonValue,
    action: entree.action,
    actionConfig:
      (configurationSaisie(entree.configuration) as
        Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
  }
}

function verifierOuRefuser(entree: unknown): RegleAutomation {
  try {
    return verifierRegle(entree)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new RegleValidationError(
        error.issues.map(
          (issue) => `${issue.path.join(".") || "règle"} : ${issue.message}`
        )
      )
    }
    throw error
  }
}

function versRegle(ligne: {
  id: string
  name: string
  enabled: boolean
  trigger: string
  condition: Prisma.JsonValue
  action: string
  actionConfig: Prisma.JsonValue | null
}): RegleAutomation {
  return {
    id: ligne.id,
    nom: ligne.name,
    declencheur: typeEvenementAutomationSchema.parse(ligne.trigger),
    condition: conditionAutomationSchema.parse(ligne.condition),
    action: ligne.action as ActionAutomation,
    ...(ligne.actionConfig
      ? { configuration: configurationRegleSchema.parse(ligne.actionConfig) }
      : {}),
    actif: ligne.enabled,
  }
}

const INCLUSIONS_LECTURE = {
  runs: {
    orderBy: { startedAt: "desc" },
    take: 1,
    select: { status: true, startedAt: true, trigger: true },
  },
} as const

interface LigneAvecExecution {
  runs: {
    status: StatutAutomation
    startedAt: Date
    trigger: DeclencheurExecution
  }[]
}

function derniereExecution(ligne: LigneAvecExecution): ExecutionResumee | null {
  const [execution] = ligne.runs
  if (!execution) return null
  return {
    statut: execution.status,
    debut: execution.startedAt,
    declencheur: execution.trigger,
  }
}

export async function listerRegles(): Promise<RegleListee[]> {
  const lignes = await prisma.automationRule.findMany({
    orderBy: { id: "asc" },
    include: INCLUSIONS_LECTURE,
  })

  return lignes.map((ligne) => ({
    ...versRegle(ligne),
    derniereExecution: derniereExecution(ligne),
  }))
}

export async function lireRegle(id: string): Promise<RegleDetaillee | null> {
  const ligne = await prisma.automationRule.findUnique({
    where: { id },
    include: {
      ...INCLUSIONS_LECTURE,
      revisions: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!ligne) return null

  return {
    ...versRegle(ligne),
    derniereExecution: derniereExecution(ligne),
    revisions: ligne.revisions.map((revision) => ({
      id: revision.id,
      auteur: revision.author,
      horodatage: revision.createdAt,
      snapshot: revision.snapshot,
    })),
  }
}

/**
 * Crée une règle depuis l'éditeur. L'identifiant est dérivé du nom — le
 * marchand ne saisit pas de clé technique — et une révision attribuée à
 * l'auteur est écrite dans la même transaction.
 */
export async function creerRegle(
  entree: EntreeRegle,
  auteur: string,
  maintenant = new Date()
): Promise<string> {
  const id = slugify(entree.nom)
  const regle = verifierOuRefuser({
    id,
    nom: entree.nom,
    declencheur: entree.declencheur,
    condition: conditionSaisie(entree.condition),
    action: entree.action,
    configuration: configurationSaisie(entree.configuration),
    actif: entree.actif,
  })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.automationRule.create({ data: donneesDeLaRegle(id, entree) })
      await ecrireRevisionRegle(tx, regle, auteur, maintenant)
    })
  } catch (error) {
    if (hasUniqueViolation(error, ["id"]))
      throw new IdentifiantRegleExisteError()
    throw error
  }

  return id
}

/**
 * Modifie une règle existante. L'identifiant ne change pas : c'est lui que
 * l'historique des exécutions référence. Une modification qui ne change rien
 * n'ajoute pas de révision.
 */
export async function modifierRegle(
  entree: EntreeRegle & { regleId: string },
  auteur: string,
  maintenant = new Date()
): Promise<void> {
  const existante = await prisma.automationRule.findUnique({
    where: { id: entree.regleId },
  })
  if (!existante) throw new RegleIntrouvableError()

  const regle = verifierOuRefuser({
    id: entree.regleId,
    nom: entree.nom,
    declencheur: entree.declencheur,
    condition: conditionSaisie(entree.condition),
    action: entree.action,
    configuration: configurationSaisie(entree.configuration),
    actif: entree.actif,
  })

  await prisma.$transaction(async (tx) => {
    await tx.automationRule.update({
      where: { id: entree.regleId },
      data: {
        name: entree.nom.trim(),
        enabled: entree.actif,
        trigger: entree.declencheur,
        condition: conditionSaisie(entree.condition) as Prisma.InputJsonValue,
        action: entree.action,
        actionConfig:
          (configurationSaisie(entree.configuration) as
            Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
      },
    })
    await ecrireRevisionRegle(tx, regle, auteur, maintenant)
  })
}

/**
 * Bascule une règle. La désactivation annule ses exécutions en cours et
 * libère le bail de leur Événement ; la réactivation ne rejoue rien, parce que
 * les Événements arrivés entre-temps ont déjà été consommés par le balayage.
 */
export async function basculerRegle(
  regleId: string,
  actif: boolean,
  auteur: string,
  maintenant = new Date()
): Promise<void> {
  const existante = await prisma.automationRule.findUnique({
    where: { id: regleId },
  })
  if (!existante) throw new RegleIntrouvableError()

  const regle = { ...versRegle(existante), actif }

  await prisma.$transaction(async (tx) => {
    await tx.automationRule.update({
      where: { id: regleId },
      data: { enabled: actif },
    })
    if (!actif) await annulerExecutionsEnCours(tx, regleId, maintenant)
    await ecrireRevisionRegle(tx, regle, auteur, maintenant)
  })
}

async function annulerExecutionsEnCours(
  tx: Prisma.TransactionClient,
  regleId: string,
  maintenant: Date
): Promise<number> {
  const executions = await tx.automationRun.findMany({
    where: { ruleId: regleId, status: "en_cours" },
    select: { id: true, startedAt: true, eventId: true },
  })
  if (executions.length === 0) return 0

  for (const execution of executions) {
    await tx.automationRun.update({
      where: { id: execution.id },
      data: {
        status: "ignore",
        lastError: MOTIF_ANNULATION,
        finishedAt: maintenant,
        durationMs: Math.max(
          0,
          maintenant.getTime() - execution.startedAt.getTime()
        ),
      },
    })
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

  return executions.length
}

export type { ActionAutomation, TypeConditionAutomation }
