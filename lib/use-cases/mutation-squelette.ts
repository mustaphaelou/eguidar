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

export async function runOrderedEffects(
  effets: readonly EffetPostCommit[]
): Promise<void> {
  for (const effet of effets) {
    await runEffect(effet.message, effet.fn)
  }
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
