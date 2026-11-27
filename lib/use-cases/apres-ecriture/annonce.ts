import type { ConsequenceAnnonce, PlanAnnonce } from "@/lib/apres-ecriture"
import {
  journalEffetsConsole,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"

import {
  executerPlan,
  executerUne as executerUneConsequence,
  type GestionnairesPour,
} from "./executeur"

export interface EffetsAnnonce {
  invalidateAnnonce(): Promise<void> | void
}

export type LecturesAnnonce = Record<string, never>

function gestionnaires(
  effets: EffetsAnnonce
): GestionnairesPour<ConsequenceAnnonce> {
  return {
    "invalidation-cache": () => effets.invalidateAnnonce(),
  }
}

export async function executer(
  plan: PlanAnnonce,
  effets: EffetsAnnonce,
  _lectures: LecturesAnnonce = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets), journal)
}

export async function executerUne(
  consequence: ConsequenceAnnonce,
  effets: EffetsAnnonce,
  _lectures: LecturesAnnonce = {}
): Promise<void> {
  await executerUneConsequence(consequence, gestionnaires(effets))
}
