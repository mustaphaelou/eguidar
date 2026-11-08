import {
  EffetNonPrisEnChargeError,
  journalEffetsConsole,
  runOrderedEffects,
  type ConsequenceDuPlan,
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
 * (ADR-0014). Un effet absent de la carte est journalisé en échec, jamais en
 * succès — mais le type l'a déjà refusé.
 */
export async function executerPlan<C extends ConsequenceDuPlan>(
  plan: { consequences: readonly C[] },
  gestionnaires: GestionnairesPour<C>,
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await runOrderedEffects(
    plan.consequences.map((consequence) => ({
      effet: consequence.effet,
      entite: consequence.entite,
      message: consequence.message,
      portee: consequence.portee,
      fn: () => {
        const gestionnaire = gestionnairePour(gestionnaires, consequence.effet)
        if (!gestionnaire)
          throw new EffetNonPrisEnChargeError(consequence.effet)
        return gestionnaire(consequence)
      },
    })),
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
