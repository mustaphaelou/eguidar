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

/**
 * Les ports de la Livraison que l'adaptateur projette. Ils sont structurellement
 * identiques à `LivraisonEffects` ; le type vit ici pour que l'adaptateur
 * n'importe pas le cas d'usage qui l'appelle.
 */
export interface EffetsLivraison {
  revalidateShipping(): void
}

/**
 * La Livraison n'a aucune lecture après commit : son plan ne porte qu'une
 * invalidation de cache, réparée par le TTL. L'entrée existe pour que les
 * quatre adaptateurs partagent la même signature.
 */
export type LecturesLivraison = Record<string, never>

function gestionnaires(
  effets: EffetsLivraison
): GestionnairesPour<ConsequenceLivraison> {
  // La carte est totale sur le seul effet que les genres de Livraison peuvent
  // déclarer : une conséquence sans gestionnaire ne compile pas.
  return {
    "invalidation-cache": () => effets.revalidateShipping(),
  }
}

/**
 * La tentative immédiate d'un plan de Livraison : ordre déclaré, isolation,
 * mesure et journal, jamais d'exception. Un échec est journalisé et le TTL du
 * cache le répare ; rien n'est rejoué.
 */
export async function executer(
  plan: PlanLivraison,
  effets: EffetsLivraison,
  _lectures: LecturesLivraison = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await executerPlan(plan, gestionnaires(effets), journal)
}

/**
 * Une conséquence de Livraison pour le travailleur : l'échec remonte, c'est lui
 * qui ferait échouer l'Exécution. Ces genres n'émettent aucune conséquence
 * durable, donc le travailleur ne les exécute jamais.
 */
export async function executerUne(
  consequence: ConsequenceLivraison,
  effets: EffetsLivraison,
  _lectures: LecturesLivraison = {}
): Promise<void> {
  await executerUneConséquence(consequence, gestionnaires(effets))
}
