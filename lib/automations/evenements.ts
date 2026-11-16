import type { Prisma } from "@/lib/generated/prisma/client"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import {
  CHARGES_PAR_DECLENCHEUR,
  TYPE_ENTITE_PAR_DECLENCHEUR,
} from "@/lib/automations/charge"

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

export const DUREE_VIE_EVENEMENT_MS = 24 * 60 * 60 * 1000

export interface EntreeEvenement {
  type: TypeEvenementAutomation
  entityType: TypeEntiteAutomation
  entityId: string
  payload: unknown
  occurredAt?: Date
  expiresAt?: Date
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

export const ChargeContractError = ContratChargeError
export const ProgrammerError = ContratChargeError
export const ErreurContratCharge = ContratChargeError
export const ChargeInvalideError = ContratChargeError
export const ErreurDeContrat = ContratChargeError
export const ContractError = ContratChargeError
export const ChargeContractViolationError = ContratChargeError

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

export interface FaitAutomation {
  declencheur: TypeEvenementAutomation
  entite: TypeEntiteAutomation
  identifiant: string
  charge: unknown
}

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
