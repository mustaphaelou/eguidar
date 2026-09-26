/**
 * Le squelette des mutations : le mécanisme que Commande, Catalogue,
 * Structure et Livraison transcrivaient chacun — la frontière best-effort, la
 * séquence d'effets post-commit, la construction du refus de validation, la
 * surcharge des effets et l'échelle des violations d'unicité (ADR-0025).
 *
 * Il ne connaît ni entité ni base de données : les types d'effets, leurs
 * défauts de production, les classes d'erreur, les listes de champs et le
 * prédicat de violation restent dans leur module (ADR-0014, ADR-0025).
 */

/**
 * La frontière best-effort : un effet auxiliaire qui échoue après le commit
 * est journalisé, jamais jeté à l'appelant — la mutation committée fait foi
 * (ADR-0014).
 *
 * La signature est la plus large des quatre copies : celle d'`orders.ts`
 * s'était rétrécie à `fn: () => void`, où l'effet asynchrone n'était plus
 * déclaré.
 */
export async function runEffect(
  message: string,
  fn: () => Promise<unknown> | unknown
): Promise<void> {
  try {
    await fn()
  } catch (error) {
    console.warn(message, error)
  }
}

export interface EffetPostCommit {
  message: string
  fn: () => Promise<unknown> | unknown
}

/**
 * Exécute une liste ordonnée d'effets post-commit, un à un.
 *
 * Chaque effet passe par la frontière best-effort : un échec est journalisé
 * avec le message fourni, puis les effets suivants continuent. La fonction
 * n'attend que leur Achèvement et ne propage pas leurs échecs.
 */
export async function runOrderedEffects(
  effets: readonly EffetPostCommit[]
): Promise<void> {
  for (const effet of effets) {
    await runEffect(effet.message, effet.fn)
  }
}

/**
 * Le message d'un refus de validation.
 *
 * Le squelette ne possède pas la classe : chaque module garde la sienne, donc
 * rien de ce qui attrape ou affirme un nom d'erreur ne change (ADR-0025).
 */
export function messageDeValidation(issues: string[]): string {
  return `Données invalides : ${issues.join(" ; ")}`
}

/**
 * Les effets d'une mutation : les défauts de production, surchargés clé par
 * clé par l'appelant. Une clé omise garde son défaut de production
 * (ADR-0014).
 */
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

/**
 * L'échelle des violations d'unicité : le premier conflit dont les champs
 * sont violés lève son erreur, sinon l'erreur remonte inchangée.
 *
 * Le prédicat est celui du module, passé en argument : le squelette n'apprend
 * aucun terme de base de données (ADR-0025).
 */
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
