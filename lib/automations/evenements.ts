import type { Prisma } from "@/lib/generated/prisma/client"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import {
  CHARGES_PAR_DECLENCHEUR,
  TYPE_ENTITE_PAR_DECLENCHEUR,
} from "@/lib/automations/charge"

/**
 * Le vocabulaire fermé des événements d'automatisation (ADR-0044). Un
 * déclencheur est une valeur de cette liste, jamais une expression libre : la
 * règle ne peut donc pas boucler sur sa propre écriture.
 */
import {
  TYPES_EVENEMENT_AUTOMATION,
  type TypeEvenementAutomation,
  typeEvenementAutomationSchema,
  TYPES_ENTITE_AUTOMATION,
  type TypeEntiteAutomation,
  typeEntiteAutomationSchema,
} from "@/lib/automations/charge"

export { TYPES_EVENEMENT_AUTOMATION, TYPES_ENTITE_AUTOMATION }
export type { TypeEvenementAutomation, TypeEntiteAutomation }
export { typeEvenementAutomationSchema, typeEntiteAutomationSchema }

/**
 * La fenêtre pendant laquelle un événement peut être rejoué. Elle vaut la
 * mémoire de la clé d'idempotence du fournisseur (24 h) : au-delà, un rejeu
 * pourrait envoyer un second e-mail, donc l'événement n'est plus exécuté et
 * se contente d'une ligne « ignoré ».
 */
export const DUREE_VIE_EVENEMENT_MS = 24 * 60 * 60 * 1000

export interface EntreeEvenement {
  type: TypeEvenementAutomation
  entityType: TypeEntiteAutomation
  entityId: string
  /** La charge est validée à l'exécution par l'action, pas par l'écrivain. */
  payload: unknown
  /** Par défaut, l'heure de l'écriture ; le planificateur la fixe à son horloge. */
  occurredAt?: Date
  expiresAt?: Date
  /**
   * La clé naturelle de l'écrivain, quand elle existe : un même
   * `(type, entité, tentative)` ne produit qu'un événement. Laisser vide
   * attribue le rang de l'événement de ce type pour l'entité.
   */
  attemptOf?: number
}

async function prochaineSequence(
  tx: Prisma.TransactionClient,
  entityType: TypeEntiteAutomation,
  entityId: string
): Promise<number> {
  const agregat = await tx.automationEvent.aggregate({
    where: { entityType, entityId },
    _max: { seq: true },
  })
  return (agregat._max.seq ?? 0) + 1
}

async function prochainRang(
  tx: Prisma.TransactionClient,
  type: TypeEvenementAutomation,
  entityId: string
): Promise<number> {
  const compte = await tx.automationEvent.count({
    where: { type, entityId },
  })
  return compte + 1
}

export class ContratChargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContratChargeError"
  }
}

// Aliases pour le nom du programmateur.
export const ChargeContractError = ContratChargeError
export const ProgrammerError = ContratChargeError
export const ErreurContratCharge = ContratChargeError
export const ChargeInvalideError = ContratChargeError
export const ErreurDeContrat = ContratChargeError
export const ContractError = ContratChargeError
export const ChargeContractViolationError = ContratChargeError

/**
 * Écrit un événement dans **la transaction de la mutation** qui le produit :
 * un retour arrière ne laisse donc ni événement ni exécution (ADR-0044).
 */
export async function enregistrerEvenement(
  tx: Prisma.TransactionClient,
  entree: EntreeEvenement
) {
  const declencheur = entree.type as TypeEvenementAutomation
  const schema = CHARGES_PAR_DECLENCHEUR[declencheur]
  const resultat = schema.safeParse(entree.payload)
  if (!resultat.success) {
    const issue = resultat.error.issues[0]
    const champ = issue?.path?.length ? issue.path.join(".") : "charge"
    throw new ContratChargeError(
      `Contrat de charge violé pour « ${declencheur} » : ${champ} — ${
        issue?.message ?? "invalide"
      }`
    )
  }
  const entiteAttendue = TYPE_ENTITE_PAR_DECLENCHEUR[declencheur]
  if (entiteAttendue !== entree.entityType) {
    throw new ContratChargeError(
      `Type d'entité incompatible pour « ${declencheur} » : attendu ${entiteAttendue}, reçu ${entree.entityType}`
    )
  }

  const occurredAt = entree.occurredAt ?? new Date()
  const seq = await prochaineSequence(tx, entree.entityType, entree.entityId)
  const attemptOf =
    entree.attemptOf ?? (await prochainRang(tx, entree.type, entree.entityId))

  return tx.automationEvent.create({
    data: {
      type: entree.type,
      entityType: entree.entityType,
      entityId: entree.entityId,
      seq,
      attemptOf,
      payload: resultat.data as Prisma.InputJsonValue,
      occurredAt,
      expiresAt:
        entree.expiresAt ??
        new Date(occurredAt.getTime() + DUREE_VIE_EVENEMENT_MS),
      availableAt: occurredAt,
    },
  })
}

/**
 * Le fait tel qu'un plan d'Après-écriture le déclare. La forme est structurelle
 * pour que le carnet ne dépende pas du module de déclaration.
 */
export interface FaitAutomation {
  declencheur: TypeEvenementAutomation
  entite: TypeEntiteAutomation
  identifiant: string
  charge: unknown
}

/**
 * Écrit tous les faits d'un plan dans la transaction de la mutation, dans
 * l'ordre déclaré. Un plan sans fait n'écrit rien.
 */
export async function enregistrerFaits(
  tx: Prisma.TransactionClient,
  faits: readonly FaitAutomation[]
): Promise<void> {
  for (const fait of faits) {
    await enregistrerEvenement(tx, {
      type: fait.declencheur,
      entityType: fait.entite,
      entityId: fait.identifiant,
      payload: fait.charge,
    })
  }
}

/**
 * La variante idempotente : le planificateur rejoue la journée sans créer de
 * doublon. Seule la violation de la clé naturelle est avalée — une autre
 * erreur remonte.
 */
export async function enregistrerEvenementSiAbsent(
  tx: Prisma.TransactionClient,
  entree: EntreeEvenement
) {
  try {
    return await enregistrerEvenement(tx, entree)
  } catch (error) {
    if (
      hasUniqueViolation(error, ["type", "entityId", "attemptOf"]) ||
      hasUniqueViolation(error, ["entityType", "entityId", "seq"])
    ) {
      return null
    }
    throw error
  }
}
