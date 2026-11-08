import {
  EffetNonPrisEnChargeError,
  journalEffetsConsole,
  runPlanEffects,
  type ConsequenceDuPlan,
  type GestionnairesEffetsPostCommit,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"

/**
 * Une lecture après commit qu'un appelant n'a pas fournie. Elle est nommée
 * pour que le journal dise quelle lecture manquait, jamais « erreur inconnue ».
 */
export class LectureManquanteError extends Error {
  constructor(readonly lecture: string) {
    super(`lecture après-écriture manquante : ${lecture}`)
    this.name = "LectureManquanteError"
  }
}

/**
 * Mémoïse une lecture paresseuse une fois par plan : la première conséquence
 * qui en a besoin la déclenche, les suivantes partagent la même promesse.
 */
export function memoise<T>(lire: () => Promise<T>): () => Promise<T> {
  let valeur: Promise<T> | undefined
  return () => (valeur ??= lire())
}

/**
 * La carte des gestionnaires d'une entité : elle est **totale** sur les effets
 * que ses genres peuvent déclarer. Un effet sans gestionnaire ne compile pas ;
 * un gestionnaire en trop non plus. Le type ne voit pas les conséquences
 * conditionnelles — la garde de l'entité les couvre.
 */
export type GestionnairesPour<C extends ConsequenceDuPlan> = {
  [E in C["effet"]]: (
    consequence: Extract<C, { effet: E }>
  ) => Promise<unknown> | unknown
}

type GestionnaireDeConséquence<C extends ConsequenceDuPlan> = (
  consequence: C
) => Promise<unknown> | unknown

function gestionnairePour<C extends ConsequenceDuPlan>(
  gestionnaires: GestionnairesPour<C>,
  effet: C["effet"]
): GestionnaireDeConséquence<C> | undefined {
  return gestionnaires[effet] as GestionnaireDeConséquence<C> | undefined
}

/**
 * La tentative immédiate d'un plan d'entité : ordre déclaré, chaque conséquence
 * dans sa propre limite d'échec, mesure et journal, jamais d'exception
 * (ADR-0014). Le squelette porte déjà cette politique ; il reçoit ici la carte
 * **totale** de l'entité, élargie à sa carte partielle le temps d'un passage.
 */
export async function executerPlan<C extends ConsequenceDuPlan>(
  plan: { consequences: readonly C[] },
  gestionnaires: GestionnairesPour<C>,
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await runPlanEffects(
    plan,
    gestionnaires as GestionnairesEffetsPostCommit,
    journal
  )
}

/**
 * Le travailleur exécute **une** conséquence : aucun journal, aucune mesure,
 * aucune exception avalée. L'échec remonte pour faire échouer l'Exécution et
 * déclencher sa reprise.
 */
export async function executerUne<C extends ConsequenceDuPlan>(
  consequence: C,
  gestionnaires: GestionnairesPour<C>
): Promise<void> {
  const gestionnaire = gestionnairePour(gestionnaires, consequence.effet)
  if (!gestionnaire) throw new EffetNonPrisEnChargeError(consequence.effet)
  await gestionnaire(consequence)
}
