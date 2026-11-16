import type { ConsequenceLivraison, PlanLivraison } from "@/lib/apres-ecriture"
import {
  journalEffetsConsole,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"

import {
  executerPlan,
  executerUne as executerUneConséquence,
  type GestionnairesPour,
} from "./executeur"

export interface EffetsLivraison {
  revalidateShipping(): void
}

export type LecturesLivraison = Record<string, never>

function gestionnaires(
  effets: EffetsLivraison
): GestionnairesPour<ConsequenceLivraison> {
  return {
    "invalidation-cache": () => effets.revalidateShipping(),
  }
}

export async function executer(
  plan: PlanLivraison,
  effets: EffetsLivraison,
  _lectures: LecturesLivraison = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets), journal)
}

export async function executerUne(
  consequence: ConsequenceLivraison,
  effets: EffetsLivraison,
  _lectures: LecturesLivraison = {}
): Promise<void> {
  await executerUneConséquence(consequence, gestionnaires(effets))
}
