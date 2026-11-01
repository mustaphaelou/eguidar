import { z } from "zod"

import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/db"
import {
  DUREE_VIE_EVENEMENT_MS,
  typeEntiteAutomationSchema,
  typeEvenementAutomationSchema,
} from "@/lib/automations/evenements"
import {
  deciderAutomation,
  type DecisionAutomation,
  type RaisonIgnoree,
} from "@/lib/automations/decision"
import {
  executerLAction,
  type DependancesAutomations,
} from "@/lib/automations/actions"
import {
  conditionAutomationSchema,
  configurationRegleSchema,
  ecrireRevisionRegle,
  verifierRegle,
  type RegleAutomation,
} from "@/lib/automations/regles"
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

/**
 * La Simulation garde ses phrases et son affichage à deux valeurs ; seule la
 * Décision juge. Le rendu reste privé pour que les trois consommateurs ne
 * partagent jamais une prose.
 */
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

/**
 * Les Événements réels qui peuvent servir de sujet à une simulation : ceux du
 * déclencheur de la règle, du plus récent au plus ancien.
 */
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

/**
 * Évalue une règle contre un Événement **réel** — sa charge, son expiration,
 * son entité. Rien n'est écrit et rien n'est envoyé : la simulation ne prend
 * même pas les ports du travailleur, elle ne peut donc pas envoyer.
 */
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

const FENETRE_REJEU_EN_HEURES = DUREE_VIE_EVENEMENT_MS / (60 * 60 * 1000)

/**
 * Le refus nomme la raison de la Décision sans rejouer son ordre : chaque
 * raison a sa phrase, et l'Événement expiré rappelle la fenêtre de rejeu. Le
 * rendu reste privé pour que la Décision et les autres consommateurs ne
 * partagent jamais une prose.
 */
function motifDuReessaiRefuse(raison: RaisonIgnoree): string {
  switch (raison.type) {
    case "evenement-expire":
      return `L'Événement a expiré le ${raison.expireLe.toISOString()} : la fenêtre de rejeu de ${FENETRE_REJEU_EN_HEURES} h est dépassée, rien n'est rejoué.`
    case "regle-desactivee":
      return "La Règle est désactivée : réactivez-la pour réessayer cette Exécution."
    case "declencheur-different":
      return `La Règle ne possède plus cet Événement : elle attend « ${libelleBrutDuDeclencheur(raison.attendu)} » (${raison.attendu}) et l'Événement porte « ${libelleBrutDuDeclencheur(raison.recu)} » (${raison.recu}).`
    case "condition-non-remplie":
      return "La condition de la Règle ne retient plus cet Événement : la modification de la Règle est honorée, rien n'est rejoué."
  }
}

/**
 * Le réessai manuel (Flow : « Manual retry », n8n : l'exécution manuelle est
 * distincte de la production). Il consulte la Décision avant d'écrire : seule
 * une paire que la Règle actuelle gouverne encore ouvre une Exécution
 * `manuel`. Un refus laisse l'échec d'origine et son Événement intacts.
 */
export async function reessayerExecution(
  executionId: string,
  dependances: DependancesAutomations
): Promise<ResultatReessai> {
  const execution = await prisma.automationRun.findUnique({
    where: { id: executionId },
    include: { event: true, rule: true },
  })
  if (!execution) throw new ExecutionIntrouvableError()
  if (execution.status !== "echoue") {
    throw new ReessaiRefuseError(
      "Seule une Exécution en échec peut être réessayée"
    )
  }
  if (!execution.event) {
    throw new ReessaiRefuseError(
      "L'Événement de cette Exécution n'existe plus : rien à rejouer"
    )
  }
  if (!execution.rule) {
    throw new ReessaiRefuseError(
      "La Règle de cette Exécution n'existe plus : rien à rejouer"
    )
  }

  const regle = versRegle(execution.rule)
  const evenement = execution.event
  const maintenant = dependances.maintenant

  const decision = deciderAutomation(execution.rule, evenement, maintenant)
  if (decision.decision === "ignorer") {
    throw new ReessaiRefuseError(motifDuReessaiRefuse(decision.raison))
  }

  const reessai = await prisma.$transaction(async (tx) => {
    const agregat = await tx.automationRun.aggregate({
      where: { eventId: evenement.id, ruleId: regle.id },
      _max: { attempt: true },
    })
    return tx.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: regle.action,
        status: "en_cours",
        attempt: (agregat._max.attempt ?? 0) + 1,
        startedAt: maintenant,
        trigger: "manuel",
      },
    })
  })

  try {
    await executerLAction({
      evenement: {
        type: typeEvenementAutomationSchema.parse(evenement.type),
        entityType: typeEntiteAutomationSchema.parse(evenement.entityType),
        entityId: evenement.entityId,
        payload: evenement.payload,
      },
      regle: {
        id: regle.id,
        action: regle.action,
        configuration: regle.configuration,
      },
      dependances,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.automationRun.update({
      where: { id: reessai.id },
      data: {
        status: "echoue",
        lastError: message,
        finishedAt: maintenant,
        durationMs: Math.max(
          0,
          maintenant.getTime() - reessai.startedAt.getTime()
        ),
      },
    })
    return { executionId: reessai.id, statut: "echoue", erreur: message }
  }

  await prisma.automationRun.update({
    where: { id: reessai.id },
    data: {
      status: "reussi",
      lastError: null,
      finishedAt: maintenant,
      durationMs: Math.max(
        0,
        maintenant.getTime() - reessai.startedAt.getTime()
      ),
    },
  })

  if (await plusAucuneRegleEnEchec(evenement.id, regle.id)) {
    await prisma.automationEvent.updateMany({
      where: { id: evenement.id },
      data: { status: "reussi", lastError: null, lockedUntil: null },
    })
  }

  return { executionId: reessai.id, statut: "reussi", erreur: null }
}

/**
 * L'Événement ne redevient « réussi » que si aucune **autre** règle n'a encore
 * sa dernière Exécution en échec : un réessai ne masque pas l'échec du voisin.
 */
async function plusAucuneRegleEnEchec(
  eventId: string,
  regleReessayee: string
): Promise<boolean> {
  const executions = await prisma.automationRun.findMany({
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

export type { ActionAutomation, TypeConditionAutomation }
