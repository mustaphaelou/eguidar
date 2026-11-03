export const TYPES_EFFET_POST_COMMIT = [
  "email",
  "invalidation-cache",
  "purge-catalogue",
  "reindexation",
  "desindexation",
  "suppression-images",
  "suppression-brouillons",
  "registre-images",
] as const

export type TypeEffetPostCommit = (typeof TYPES_EFFET_POST_COMMIT)[number]

export const TYPES_ENTITE_EFFET_POST_COMMIT = [
  "produit",
  "commande",
  "categorie",
  "ville",
  "livraison",
] as const

export type TypeEntiteEffetPostCommit =
  (typeof TYPES_ENTITE_EFFET_POST_COMMIT)[number]

export interface EntiteEffetPostCommit {
  type: TypeEntiteEffetPostCommit
  /** L'identifiant reste lisible dans le journal pour retrouver l'objet. */
  id: string
}

export type ResultatEffetPostCommit = "succes" | "echec"

/**
 * La mesure d'un effet post-commit : c'est la ligne que Phase 4 écrira en base
 * sans changer la couture. `dureeMs` est mesurée autour de `fn`, et `erreur`
 * ne porte que le message — jamais la pile ni les secrets.
 */
export interface MesureEffetPostCommit {
  effet: TypeEffetPostCommit
  entite: EntiteEffetPostCommit
  resultat: ResultatEffetPostCommit
  dureeMs: number
  message: string
  erreur?: string
  portee?: number
}

export interface JournalEffetsPostCommit {
  enregistrer(mesure: MesureEffetPostCommit): void
}

/**
 * Le journal par défaut : une ligne JSON préfixée, sur `warn` pour un échec et
 * sur `info` pour une réussite. En test, les réussites restent silencieuses —
 * le port mémoire de `test/` porte alors la forme attendue.
 */
export const journalEffetsConsole: JournalEffetsPostCommit = {
  enregistrer(mesure) {
    const ligne = `[effet] ${JSON.stringify(mesure)}`
    if (mesure.resultat === "echec") {
      console.warn(ligne)
    } else if (process.env.NODE_ENV !== "test") {
      console.info(ligne)
    }
  },
}

export interface EffetPostCommit {
  effet: TypeEffetPostCommit
  entite: EntiteEffetPostCommit
  /** Le libellé historique, conservé dans la mesure et les logs. */
  message: string
  portee?: number
  fn: () => Promise<unknown> | unknown
}

function messageDeLErreur(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function enregistrerSansCasser(
  journal: JournalEffetsPostCommit,
  mesure: MesureEffetPostCommit
): void {
  try {
    journal.enregistrer(mesure)
  } catch (error) {
    console.warn("[effet] journal indisponible", error)
  }
}

/**
 * La seule porte des effets post-commit. Elle mesure, journalise et n'échoue
 * jamais : le commit est autoritatif (ADR-0014). Phase 4 remplacera le journal
 * par une écriture durable, sans toucher aux mutations.
 */
export async function runEffect(
  effet: EffetPostCommit,
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  const debut = Date.now()
  try {
    await effet.fn()
    enregistrerSansCasser(journal, {
      effet: effet.effet,
      entite: effet.entite,
      resultat: "succes",
      dureeMs: Date.now() - debut,
      message: effet.message,
      portee: effet.portee,
    })
  } catch (error) {
    enregistrerSansCasser(journal, {
      effet: effet.effet,
      entite: effet.entite,
      resultat: "echec",
      dureeMs: Date.now() - debut,
      message: effet.message,
      erreur: messageDeLErreur(error),
      portee: effet.portee,
    })
  }
}

export async function runOrderedEffects(
  effets: readonly EffetPostCommit[],
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  for (const effet of effets) {
    await runEffect(effet, journal)
  }
}

/**
 * La conséquence telle qu'un plan d'Après-écriture la déclare. La forme reste
 * structurelle pour que le squelette ne dépende pas du module de déclaration.
 */
export interface ConsequenceDuPlan {
  effet: TypeEffetPostCommit
  entite: EntiteEffetPostCommit
  message: string
  portee?: number
}

export interface PlanPostCommit {
  consequences: readonly ConsequenceDuPlan[]
}

export type GestionnairesEffetsPostCommit = Partial<
  Record<
    TypeEffetPostCommit,
    (consequence: ConsequenceDuPlan) => Promise<unknown> | unknown
  >
>

export class EffetNonPrisEnChargeError extends Error {
  constructor(readonly effet: TypeEffetPostCommit) {
    super(`effet post-commit non pris en charge : ${effet}`)
    this.name = "EffetNonPrisEnChargeError"
  }
}

/**
 * La seule porte d'un plan : chaque conséquence trouve son gestionnaire par
 * nom d'effet. Un effet absent de la carte échoue nommément — une conséquence
 * déclarée sans adaptation est journalisée en échec, jamais en succès.
 */
export async function runPlanEffects(
  plan: PlanPostCommit,
  gestionnaires: GestionnairesEffetsPostCommit,
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await runOrderedEffects(
    plan.consequences.map((consequence) => ({
      effet: consequence.effet,
      entite: consequence.entite,
      message: consequence.message,
      portee: consequence.portee,
      fn: () => {
        const gestionnaire = gestionnaires[consequence.effet]
        if (!gestionnaire)
          throw new EffetNonPrisEnChargeError(consequence.effet)
        return gestionnaire(consequence)
      },
    })),
    journal
  )
}

export function messageDeValidation(issues: string[]): string {
  return `Données invalides : ${issues.join(" ; ")}`
}

export function avecSurcharges<T extends object>(
  defaults: T,
  overrides?: Partial<T>
): T {
  return { ...defaults, ...overrides }
}

export interface ConflitUnique {
  champs: string[]
  erreur: Error
}

export function leverConflitUnique(
  error: unknown,
  conflits: ConflitUnique[],
  estViolation: (error: unknown, champs: string[]) => boolean
): never {
  for (const conflit of conflits) {
    if (estViolation(error, conflit.champs)) throw conflit.erreur
  }
  throw error
}
