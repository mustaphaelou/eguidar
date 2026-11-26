import { z } from "zod"

import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import {
  typeEntiteAutomationSchema,
  typeEvenementAutomationSchema,
} from "@/lib/automations/evenements"
import {
  deciderAutomation,
  type DecisionAutomation,
} from "@/lib/automations/decision"
import { type DependancesAutomations } from "@/lib/automations/actions"
import { executerActionOuRedeclaration } from "@/lib/automations/execution-durable"
import {
  ecrireRevisionRegle,
  verifierRegle,
  versRegle,
  type RegleAutomation,
} from "@/lib/automations/regles"
import {
  annulerExecutionsEnCours,
  ouvrirReessai,
  terminerExecution,
  type RefusReessai,
} from "@/lib/automations/executions"
import {
  LIBELLES_ACTION,
  libelleBrutDuDeclencheur,
  libelleDeLaCondition,
  type ActionAutomation,
  type ConfigurationRegle,
  type TypeConditionAutomation,
} from "@/lib/automations/vocabulaire"
import type {
  DeclencheurExecution,
  StatutAutomation,
} from "@/lib/generated/prisma/client"
import { slugify } from "@/lib/slug"
import { messageDeValidation } from "@/lib/use-cases/mutation-squelette"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export class RegleIntrouvableError extends UserFacingError {
  constructor() {
    super("Règle d'automatisation introuvable")
    this.name = "RegleIntrouvableError"
  }
}

export class EvenementIntrouvableError extends UserFacingError {
  constructor() {
    super("Événement d'automatisation introuvable")
    this.name = "EvenementIntrouvableError"
  }
}

export class ExecutionIntrouvableError extends UserFacingError {
  constructor() {
    super("Exécution d'automatisation introuvable")
    this.name = "ExecutionIntrouvableError"
  }
}

export class ReessaiRefuseError extends UserFacingError {
  constructor(message: string) {
    super(message)
    this.name = "ReessaiRefuseError"
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
    super(messageDeValidation(issues))
    this.name = "RegleValidationError"
  }
}

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
    if (!actif)
      await annulerExecutionsEnCours({ regleId, maintenant, client: tx })
    await ecrireRevisionRegle(tx, regle, auteur, maintenant)
  })
}

export interface EvenementSimulable {
  id: string
  type: string
  entityType: string
  entityId: string
  occurredAt: Date
  expiresAt: Date
  statut: StatutAutomation
}

export interface DecisionSimulation {
  decision: "enverrait" | "ignorerait"
  motif: string
  evenement: EvenementSimulable
}

function libelleDeLAction(action: ActionAutomation): string {
  return `« ${LIBELLES_ACTION[action]} »`
}

function motifDeLaSimulation(
  decision: DecisionAutomation,
  regle: RegleAutomation,
  action: string
): string {
  if (decision.decision === "executer") {
    if (decision.condition === "statut-commande") {
      return `La condition « ${libelleDeLaCondition(decision.condition)} » retient le statut « ${String(decision.statut)} » : l'action ${action} serait exécutée.`
    }
    return `La condition « ${libelleDeLaCondition(decision.condition)} » est remplie : l'action ${action} serait exécutée.`
  }

  const raison = decision.raison
  switch (raison.type) {
    case "declencheur-different": {
      return `Le déclencheur de la règle ne correspond pas : « ${libelleBrutDuDeclencheur(raison.recu)} » (${raison.recu}) au lieu de « ${libelleBrutDuDeclencheur(regle.declencheur)} » (${regle.declencheur}) : l'action ${action} serait ignorée.`
    }
    case "regle-desactivee":
      return "La règle est désactivée : l'action ne serait pas exécutée."
    case "evenement-expire":
      return `L'Événement a expiré le ${raison.expireLe.toISOString()} : l'action ne serait pas exécutée.`
    case "condition-non-remplie":
      return `La condition « ${libelleDeLaCondition(regle.condition.type)} » ne retient pas le statut « ${String(raison.statut)} » : l'action ${action} serait ignorée.`
  }
}

export async function listerEvenementsSimulables(
  regleId: string,
  limite = 10
): Promise<EvenementSimulable[]> {
  const regle = await prisma.automationRule.findUnique({
    where: { id: regleId },
    select: { trigger: true },
  })
  if (!regle) throw new RegleIntrouvableError()

  const evenements = await prisma.automationEvent.findMany({
    where: { type: regle.trigger },
    orderBy: { occurredAt: "desc" },
    take: limite,
    select: {
      id: true,
      type: true,
      entityType: true,
      entityId: true,
      occurredAt: true,
      expiresAt: true,
      status: true,
    },
  })

  return evenements.map((evenement) => ({
    id: evenement.id,
    type: evenement.type,
    entityType: evenement.entityType,
    entityId: evenement.entityId,
    occurredAt: evenement.occurredAt,
    expiresAt: evenement.expiresAt,
    statut: evenement.status,
  }))
}

export async function simulerRegle(
  options: { regleId: string; evenementId: string },
  maintenant = new Date()
): Promise<DecisionSimulation> {
  const ligne = await prisma.automationRule.findUnique({
    where: { id: options.regleId },
  })
  if (!ligne) throw new RegleIntrouvableError()
  const regle = versRegle(ligne)

  const evenement = await prisma.automationEvent.findUnique({
    where: { id: options.evenementId },
  })
  if (!evenement) throw new EvenementIntrouvableError()

  const sujet: EvenementSimulable = {
    id: evenement.id,
    type: evenement.type,
    entityType: evenement.entityType,
    entityId: evenement.entityId,
    occurredAt: evenement.occurredAt,
    expiresAt: evenement.expiresAt,
    statut: evenement.status,
  }
  const decision = deciderAutomation(ligne, evenement, maintenant)

  return {
    decision: decision.decision === "executer" ? "enverrait" : "ignorerait",
    motif: motifDeLaSimulation(decision, regle, libelleDeLAction(regle.action)),
    evenement: sujet,
  }
}

export interface ResultatReessai {
  executionId: string
  statut: "reussi" | "echoue"
  erreur: string | null
}

function lancerRefusReessai(raison: RefusReessai): never {
  switch (raison.type) {
    case "introuvable":
      throw new ExecutionIntrouvableError()
    case "pas-en-echec":
      throw new ReessaiRefuseError(
        "Seule une Exécution en échec peut être réessayée"
      )
    case "evenement-disparu":
      throw new ReessaiRefuseError(
        "L'Événement de cette Exécution n'existe plus : rien à rejouer"
      )
    case "regle-disparue":
      throw new ReessaiRefuseError(
        "La Règle de cette Exécution n'existe plus : rien à rejouer"
      )
    case "evenement-expire":
      throw new ReessaiRefuseError(
        `L'Événement a expiré le ${raison.expireLe.toISOString()} : sa fenêtre de rejeu est passée, un réessai pourrait produire un doublon.`
      )
    case "regle-desactivee":
      throw new ReessaiRefuseError(
        "La Règle est désactivée : réactivez-la pour réessayer cette Exécution."
      )
    case "declencheur-different":
      throw new ReessaiRefuseError(
        `La Règle ne possède plus cet Événement : elle attend « ${libelleBrutDuDeclencheur(raison.attendu)} » (${raison.attendu}) et l'Événement porte « ${libelleBrutDuDeclencheur(raison.recu)} » (${raison.recu}).`
      )
    case "condition-non-remplie":
      throw new ReessaiRefuseError(
        "La condition de la Règle ne retient plus cet Événement : la modification de la Règle est honorée, rien n'est rejoué."
      )
  }
}

export async function reessayerExecution(
  executionId: string,
  dependances: DependancesAutomations
): Promise<ResultatReessai> {
  const maintenant = dependances.maintenant
  const ouverture = await ouvrirReessai(executionId, { maintenant })
  if (!ouverture.ok) {
    lancerRefusReessai(ouverture.raison)
  }

  const reessaiId = ouverture.execution.id
  const regleOuverte = ouverture.regle
  const evenementOuvert = ouverture.evenement

  try {
    await executerActionOuRedeclaration({
      evenement: {
        type: typeEvenementAutomationSchema.parse(evenementOuvert.type),
        entityType: typeEntiteAutomationSchema.parse(
          evenementOuvert.entityType
        ),
        entityId: evenementOuvert.entityId,
        payload: evenementOuvert.payload,
      },
      regle: {
        id: regleOuverte.id,
        action: regleOuverte.action,
        configuration: regleOuverte.configuration,
      },
      dependances,
    })
    await terminerExecution({
      executionId: reessaiId,
      issue: "reussi",
      maintenant,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await terminerExecution({
      executionId: reessaiId,
      issue: "echoue",
      erreur: message,
      maintenant,
    })
    return { executionId: reessaiId, statut: "echoue", erreur: message }
  }

  return { executionId: reessaiId, statut: "reussi", erreur: null }
}

export type { ActionAutomation, TypeConditionAutomation }
