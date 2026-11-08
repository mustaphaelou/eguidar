import {
  analyserCharge,
  declarerDepuisLaChargeValidee,
  type Redeclaration,
} from "@/lib/apres-ecriture-redeclaration"

import {
  estActionPlanifiee,
  executerLAction,
  type ContexteAction,
} from "@/lib/automations/actions"
import { creerPont } from "@/lib/automations/ponts"

/**
 * La porte unique d'une Règle sur un Événement, partagée par le travailleur et
 * le réessai manuel. La Charge est analysée ici, une seule fois, et seulement
 * quand une Règle s'exécute : un événement expiré, ignoré ou sans Règle n'est
 * jamais validé. Une action planifiée reçoit la Charge analysée ; une action
 * durable redéclare le plan unitaire depuis elle, garde les conséquences de la
 * Règle et les exécute dans l'ordre du plan. Une action que le genre ne déclare
 * pas n'exécute rien.
 */
export async function executerActionOuRedeclaration(
  contexte: ContexteAction
): Promise<void> {
  const action = contexte.regle.action
  const charge = analyserCharge(
    contexte.evenement.type,
    contexte.evenement.payload
  )

  if (estActionPlanifiee(action)) {
    await executerLAction({
      ...contexte,
      evenement: { ...contexte.evenement, payload: charge },
      regle: { ...contexte.regle, action },
    })
    return
  }

  const redeclaration: Redeclaration | null = declarerDepuisLaChargeValidee(
    contexte.evenement.type,
    contexte.evenement.entityId,
    charge
  )
  if (!redeclaration) return

  const consequences = redeclaration.plan.consequences.filter(
    (consequence) => consequence.durable && consequence.action === action
  )
  if (consequences.length === 0) return

  const pont = creerPont(
    redeclaration.genre,
    contexte.evenement.type,
    charge,
    contexte.dependances
  )
  for (const consequence of consequences) {
    await pont.executerUne(consequence)
  }
}
