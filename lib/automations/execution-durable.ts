import {
  declarerDepuisLaCharge,
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
 * le réessai manuel. Une action planifiée garde son corps ; une action durable
 * redéclare le plan unitaire depuis la Charge, garde les conséquences de la
 * Règle et les exécute dans l'ordre du plan. Une action que le genre ne déclare
 * pas n'exécute rien.
 */
export async function executerActionOuRedeclaration(
  contexte: ContexteAction
): Promise<void> {
  const action = contexte.regle.action
  if (estActionPlanifiee(action)) {
    await executerLAction({
      ...contexte,
      regle: { ...contexte.regle, action },
    })
    return
  }

  const redeclaration: Redeclaration | null = declarerDepuisLaCharge(
    contexte.evenement.type,
    contexte.evenement.entityId,
    contexte.evenement.payload
  )
  if (!redeclaration) return

  const consequences = redeclaration.plan.consequences.filter(
    (consequence) => consequence.durable && consequence.action === action
  )
  if (consequences.length === 0) return

  const pont = creerPont(
    redeclaration.genre,
    contexte.evenement.type,
    contexte.evenement.payload,
    contexte.dependances
  )
  for (const consequence of consequences) {
    await pont.executerUne(consequence)
  }
}
