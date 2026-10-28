import { prisma } from "@/lib/db"
import {
  DUREE_VIE_EVENEMENT_MS,
  enregistrerEvenementSiAbsent,
  type TypeEvenementAutomation,
} from "@/lib/automations/evenements"

export const HEURE_DIGEST_STOCK_BAS = 7
export const HEURE_RECONCILIATION = 3

/**
 * La journée d'une planification est celle de l'horloge **injectée**, en UTC :
 * deux exécutions le même jour tombent sur le même identifiant d'entité, donc
 * sur la même clé naturelle — le second passage d'un tâcheron ne crée pas de
 * doublon, il ne trouve rien à faire.
 */
export function jourDeLHorloge(maintenant: Date): string {
  return maintenant.toISOString().slice(0, 10)
}

async function planifier(
  type: TypeEvenementAutomation,
  maintenant: Date
): Promise<boolean> {
  const jour = jourDeLHorloge(maintenant)
  return prisma.$transaction(async (tx) => {
    const evenement = await enregistrerEvenementSiAbsent(tx, {
      type,
      entityType: "planification",
      entityId: jour,
      attemptOf: 1,
      payload: { jour },
      occurredAt: maintenant,
      expiresAt: new Date(maintenant.getTime() + DUREE_VIE_EVENEMENT_MS),
    })
    return evenement !== null
  })
}

export async function planifierLeDigestStockBas(
  maintenant: Date
): Promise<boolean> {
  return planifier("planification.digest-stock-bas", maintenant)
}

export async function planifierLaReconciliation(
  maintenant: Date
): Promise<boolean> {
  return planifier("planification.reconciliation-recherche", maintenant)
}
