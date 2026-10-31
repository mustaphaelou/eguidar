import { expect, vi } from "vitest"

import type { MesureEffetPostCommit } from "@/lib/use-cases/mutation-squelette"

export type EffetQuiEchoue = () => Promise<never>

function mesuresDEchec(warnSpy: {
  mock: { calls: unknown[][] }
}): MesureEffetPostCommit[] {
  return warnSpy.mock.calls.flatMap(([ligne]) => {
    if (typeof ligne !== "string" || !ligne.startsWith("[effet] ")) return []
    const mesure = JSON.parse(
      ligne.slice("[effet] ".length)
    ) as MesureEffetPostCommit
    return mesure.resultat === "echec" ? [mesure] : []
  })
}

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
    const mesure = mesuresDEchec(warnSpy).find((candidate) =>
      candidate.message.includes(message)
    )
    expect(mesure).toMatchObject({
      resultat: "echec",
      dureeMs: expect.any(Number),
      erreur: panne.message,
    })
    expect(mesure!.effet).toBeTruthy()
    expect(mesure!.entite.id).toBeTruthy()
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
