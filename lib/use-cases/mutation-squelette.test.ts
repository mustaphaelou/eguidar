import { describe, expect, it, vi } from "vitest"

import {
  avecSurcharges,
  messageDeValidation,
  runEffect,
} from "@/lib/use-cases/mutation-squelette"

/** Un bundle d'effets factice : la suite ne monte aucune entité. */
type FauxEffets = {
  notifier(): Promise<void>
  reindexer(): void
}

const effetsParDefaut: FauxEffets = {
  async notifier() {},
  reindexer() {},
}

describe("la frontière best-effort", () => {
  it("journalise l'échec d'un effet post-commit sans le jeter à l'appelant", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const panne = new Error("moteur de recherche indisponible")
    try {
      await expect(
        runEffect("réindexation non effectuée", async () => {
          throw panne
        })
      ).resolves.toBeUndefined()
      // Un effet synchrone qui jette franchit la même frontière : la copie
      // d'orders.ts s'était rétrécie à `() => void`.
      await expect(
        runEffect("invalidation non effectuée", () => {
          throw panne
        })
      ).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith("réindexation non effectuée", panne)
      expect(warnSpy).toHaveBeenCalledWith("invalidation non effectuée", panne)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe("le refus de validation", () => {
  it("construit le message d'un refus de validation", () => {
    expect(
      messageDeValidation(["nom requis", "le stock doit être positif ou nul"])
    ).toBe("Données invalides : nom requis ; le stock doit être positif ou nul")
  })
})

describe("la surcharge des effets", () => {
  it("donne la priorité à la surcharge, clé par clé", () => {
    const notifier = vi.fn(async () => {})

    const effets = avecSurcharges(effetsParDefaut, { notifier })

    expect(effets.notifier).toBe(notifier)
  })

  it("retombe sur le défaut de production pour une clé omise", () => {
    const notifier = vi.fn(async () => {})

    const effets = avecSurcharges(effetsParDefaut, { notifier })

    expect(effets.reindexer).toBe(effetsParDefaut.reindexer)
    expect(avecSurcharges(effetsParDefaut).notifier).toBe(
      effetsParDefaut.notifier
    )
  })
})
