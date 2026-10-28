import type { Prisma } from "@/lib/generated/prisma/client"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"

/**
 * Le vocabulaire fermé des événements d'automatisation (ADR-0041). Un
 * déclencheur est une valeur de cette liste, jamais une expression libre : la
 * règle ne peut donc pas boucler sur sa propre écriture.
 */
export const TYPES_EVENEMENT_AUTOMATION = Object.freeze([
  "commande.creee",
  "commande.statut.changee",
  "produit.enregistre",
  "produit.supprime",
  "variante.stock.changee",
  "structure.creee",
  "structure.modifiee",
  "structure.supprimee",
  "planification.digest-stock-bas",
  "planification.reconciliation-recherche",
] as const)

export type TypeEvenementAutomation =
  (typeof TYPES_EVENEMENT_AUTOMATION)[number]

export const TYPES_ENTITE_AUTOMATION = Object.freeze([
  "commande",
  "produit",
  "categorie",
  "planification",
] as const)

export type TypeEntiteAutomation = (typeof TYPES_ENTITE_AUTOMATION)[number]

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

/**
 * Écrit un événement dans **la transaction de la mutation** qui le produit :
 * un retour arrière ne laisse donc ni événement ni exécution (ADR-0041).
 */
export async function enregistrerEvenement(
  tx: Prisma.TransactionClient,
  entree: EntreeEvenement
) {
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
      payload: entree.payload as Prisma.InputJsonValue,
      occurredAt,
      expiresAt:
        entree.expiresAt ??
        new Date(occurredAt.getTime() + DUREE_VIE_EVENEMENT_MS),
      availableAt: occurredAt,
    },
  })
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
