import { expect, vi } from "vitest"

export type EffetQuiEchoue = () => Promise<never>

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
