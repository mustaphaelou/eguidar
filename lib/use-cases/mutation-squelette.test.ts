import { describe, expect, it, vi } from "vitest"

import {
  avecSurcharges,
  messageDeValidation,
  runEffect,
  runOrderedEffects,
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

describe("les effets post-commit ordonnés", () => {
  it("exécute chaque effet dans l'ordre et attend sa résolution", async () => {
    const ordre: string[] = []
    let finirPremier!: () => void
    const premierEnCours = new Promise<void>((resolve) => {
      finirPremier = resolve
    })
    const premier = vi.fn(async () => {
      ordre.push("premier:début")
      await premierEnCours
      ordre.push("premier:fin")
    })
    const deuxieme = vi.fn(() => {
      ordre.push("deuxième")
    })

    const resultat = runOrderedEffects([
      { message: "premier", fn: premier },
      { message: "deuxième", fn: deuxieme },
    ])

    await Promise.resolve()
    expect(premier).toHaveBeenCalledOnce()
    expect(deuxieme).not.toHaveBeenCalled()
    expect(ordre).toEqual(["premier:début"])

    finirPremier()

    await expect(resultat).resolves.toBeUndefined()
    expect(ordre).toEqual(["premier:début", "premier:fin", "deuxième"])
    expect(deuxieme).toHaveBeenCalledOnce()
  })

  it("continue après un effet synchrone qui échoue", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const panne = new Error("effet synchrone indisponible")
    const suivant = vi.fn()
    try {
      await expect(
        runOrderedEffects([
          {
            message: "effet synchrone non effectué",
            fn: () => {
              throw panne
            },
          },
          { message: "effet suivant", fn: suivant },
        ])
      ).resolves.toBeUndefined()

      expect(suivant).toHaveBeenCalledOnce()
      expect(warnSpy).toHaveBeenCalledWith(
        "effet synchrone non effectué",
        panne
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("continue après un rejet asynchrone et journalise chaque échec", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const premierePanne = new Error("premier effet asynchrone indisponible")
    const secondePanne = new Error("second effet asynchrone indisponible")
    const apresRejet = vi.fn()
    const dernier = vi.fn()
    try {
      await expect(
        runOrderedEffects([
          {
            message: "premier rejet asynchrone",
            fn: async () => {
              throw premierePanne
            },
          },
          { message: "effet après le rejet", fn: apresRejet },
          {
            message: "second rejet asynchrone",
            fn: () => Promise.reject(secondePanne),
          },
          { message: "dernier effet", fn: dernier },
        ])
      ).resolves.toBeUndefined()

      expect(apresRejet).toHaveBeenCalledOnce()
      expect(dernier).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls).toEqual([
        ["premier rejet asynchrone", premierePanne],
        ["second rejet asynchrone", secondePanne],
      ])
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("résout après des effets réussis", async () => {
    const premier = vi.fn(async () => {})
    const second = vi.fn(() => {})

    await expect(
      runOrderedEffects([
        { message: "premier effet", fn: premier },
        { message: "second effet", fn: second },
      ])
    ).resolves.toBeUndefined()

    expect(premier).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
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
