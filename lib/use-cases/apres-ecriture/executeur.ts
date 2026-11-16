import {
  EffetNonPrisEnChargeError,
  journalEffetsConsole,
  runPlanEffects,
  type ConsequenceDuPlan,
  type GestionnairesEffetsPostCommit,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"

export class LectureManquanteError extends Error {
  constructor(readonly lecture: string) {
    super(`lecture après-écriture manquante : ${lecture}`)
    this.name = "LectureManquanteError"
  }
}

export function memoise<T>(lire: () => Promise<T>): () => Promise<T> {
  let valeur: Promise<T> | undefined
  return () => (valeur ??= lire())
}

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

export async function executerUne<C extends ConsequenceDuPlan>(
  consequence: C,
  gestionnaires: GestionnairesPour<C>
): Promise<void> {
  const gestionnaire = gestionnairePour(gestionnaires, consequence.effet)
  if (!gestionnaire) throw new EffetNonPrisEnChargeError(consequence.effet)
  await gestionnaire(consequence)
}
