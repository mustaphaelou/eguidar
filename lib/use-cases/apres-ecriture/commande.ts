import type { OrderEmailSnapshot } from "@/lib/automations/charge"
import type {
  ConsequenceCommande,
  PlanCommande,
  StatutCommande,
} from "@/lib/apres-ecriture"
import {
  EffetNonPrisEnChargeError,
  journalEffetsConsole,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"

import {
  executerPlan,
  executerUne as executerUneConséquence,
  type GestionnairesPour,
} from "./executeur"

export interface EffetsCommande {
  sendOrderPlacedEmail(order: OrderEmailSnapshot): Promise<void>
  sendOrderStatusEmail(
    order: OrderEmailSnapshot,
    newStatus: StatutCommande
  ): Promise<void>
}

function gestionnaires(
  effets: EffetsCommande
): GestionnairesPour<ConsequenceCommande> {
  return {
    email: (consequence) => {
      if (consequence.action === "email.commande-creee") {
        return effets.sendOrderPlacedEmail(consequence.payload.snapshot)
      }
      if (consequence.action === "email.commande-statut") {
        const statut = consequence.payload.statut
        if (!statut) throw new EffetNonPrisEnChargeError(consequence.effet)
        return effets.sendOrderStatusEmail(consequence.payload.snapshot, statut)
      }
      throw new EffetNonPrisEnChargeError(consequence.effet)
    },
  }
}

export async function executer(
  plan: PlanCommande,
  effets: EffetsCommande,
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets), journal)
}

export async function executerUne(
  consequence: ConsequenceCommande,
  effets: EffetsCommande
): Promise<void> {
  await executerUneConséquence(consequence, gestionnaires(effets))
}
