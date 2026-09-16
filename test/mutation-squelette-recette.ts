import { expect, vi } from "vitest"

/**
 * Les assertions que les quatre suites de mutation partagent : la frontière
 * best-effort et le refus de validation se prouvent ici une fois, chaque suite
 * gardant les invariants de son entité dans son propre fichier (ADR-0025).
 */

/** L'effet auxiliaire qu'une suite injecte pour éprouver la frontière. */
export type EffetQuiEchoue = () => Promise<never>

/**
 * Une mutation committée dont l'effet auxiliaire échoue résout quand même, et
 * l'échec n'est que journalisé : `console.warn` reçoit le message de
 * l'appelant et l'erreur jetée (ADR-0014).
 *
 * `message` est le fragment que le module passe à la frontière
 * (« réindexation », « invalidation »…) ; `muter` reçoit l'effet qui échoue et
 * l'injecte là où le module l'attend.
 */
export async function verifierFrontiereBestEffort<T>(
  message: string,
  muter: (effetQuiEchoue: EffetQuiEchoue) => Promise<T>
): Promise<T> {
  const panne = new Error("effet auxiliaire indisponible")
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const resultat = await muter(async () => {
      throw panne
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(message),
      panne
    )
    return resultat
  } finally {
    warnSpy.mockRestore()
  }
}

/**
 * Le refus de validation : une entrée invalide est refusée par la classe de
 * son module, qui porte le message construit par `messageDeValidation`.
 * Chaque suite garde sa classe et ses entrées ; seule la forme du refus est
 * partagée.
 */
export async function verifierRefusValidation<E extends Error>(
  classe: new (...args: never[]) => E,
  soumettre: () => Promise<unknown>
): Promise<E> {
  const refus: unknown = await soumettre().then(
    () => undefined,
    (error: unknown) => error
  )
  if (!(refus instanceof classe)) {
    throw new Error(
      `refus attendu : ${classe.name} — reçu : ${
        refus instanceof Error ? refus.name : String(refus)
      }`
    )
  }
  expect(refus.message).toMatch(/^Données invalides : .+/)
  return refus
}
