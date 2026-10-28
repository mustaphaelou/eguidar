import { describe, expect, it, vi } from "vitest"

import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

import {
  avecSurcharges,
  journalEffetsConsole,
  messageDeValidation,
  runEffect,
  runOrderedEffects,
  type EffetPostCommit,
  type MesureEffetPostCommit,
} from "@/lib/use-cases/mutation-squelette"

type FauxEffets = {
  notifier(): Promise<void>
  reindexer(): void
}

const effetsParDefaut: FauxEffets = {
  async notifier() {},
  reindexer() {},
}

const REINDEXATION: EffetPostCommit = {
  effet: "reindexation",
  entite: { type: "produit", id: "produit-1" },
  message: "réindexation non effectuée",
  fn: async () => {},
}

function mesureDeLigne(ligne: unknown): MesureEffetPostCommit {
  const texte = String(ligne)
  expect(texte.startsWith("[effet] ")).toBe(true)
  return JSON.parse(texte.slice("[effet] ".length)) as MesureEffetPostCommit
}

describe("la frontière best-effort", () => {
  it("journalise l'échec d'un effet post-commit sans le jeter à l'appelant", async () => {
    const journal = creerJournalEffetsMemoire()
    const panne = new Error("moteur de recherche indisponible")

    await expect(
      runEffect(
        {
          effet: "reindexation",
          entite: { type: "produit", id: "produit-9" },
          message: "réindexation non effectuée",
          fn: async () => {
            throw panne
          },
        },
        journal
      )
    ).resolves.toBeUndefined()

    expect(journal.mesures).toEqual([
      {
        effet: "reindexation",
        entite: { type: "produit", id: "produit-9" },
        resultat: "echec",
        dureeMs: expect.any(Number),
        message: "réindexation non effectuée",
        erreur: "moteur de recherche indisponible",
      },
    ])
    expect(journal.mesures[0]!.dureeMs).toBeGreaterThanOrEqual(0)
  })

  it("journalise une réussite avec la même forme, sans erreur", async () => {
    const journal = creerJournalEffetsMemoire()

    await runEffect(REINDEXATION, journal)

    expect(journal.mesures).toEqual([
      {
        effet: "reindexation",
        entite: { type: "produit", id: "produit-1" },
        resultat: "succes",
        dureeMs: expect.any(Number),
        message: "réindexation non effectuée",
      },
    ])
    expect(journal.mesures[0]).not.toHaveProperty("erreur")
  })

  it("écrit l'échec en JSON sur console.warn sans interrompre l'appelant", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const panne = new Error("moteur de recherche indisponible")
    try {
      await expect(
        runEffect({
          ...REINDEXATION,
          fn: () => {
            throw panne
          },
        })
      ).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalledOnce()
      const mesure = mesureDeLigne(warnSpy.mock.calls[0]?.[0])
      expect(mesure).toMatchObject({
        effet: "reindexation",
        entite: { type: "produit", id: "produit-1" },
        resultat: "echec",
        erreur: "moteur de recherche indisponible",
      })
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("écrit la réussite en JSON hors des tests, avec la même forme", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const environnement = process.env as Record<string, string | undefined>
    const modeInitial = environnement.NODE_ENV
    environnement.NODE_ENV = "development"
    try {
      journalEffetsConsole.enregistrer({
        effet: "invalidation-cache",
        entite: { type: "commande", id: "commande-1" },
        resultat: "succes",
        dureeMs: 12,
        message: "invalidation du cache non effectuée",
      })

      expect(infoSpy).toHaveBeenCalledOnce()
      expect(mesureDeLigne(infoSpy.mock.calls[0]?.[0])).toMatchObject({
        effet: "invalidation-cache",
        entite: { type: "commande", id: "commande-1" },
        resultat: "succes",
        dureeMs: 12,
      })
    } finally {
      if (modeInitial === undefined) delete environnement.NODE_ENV
      else environnement.NODE_ENV = modeInitial
      infoSpy.mockRestore()
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
      {
        effet: "reindexation",
        entite: { type: "produit", id: "produit-1" },
        message: "premier",
        fn: premier,
      },
      {
        effet: "invalidation-cache",
        entite: { type: "produit", id: "produit-1" },
        message: "deuxième",
        fn: deuxieme,
      },
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

  it("continue après un effet synchrone qui échoue, en gardant les deux mesures", async () => {
    const journal = creerJournalEffetsMemoire()
    const panne = new Error("effet synchrone indisponible")
    const suivant = vi.fn()

    await expect(
      runOrderedEffects(
        [
          {
            effet: "reindexation",
            entite: { type: "produit", id: "produit-1" },
            message: "effet synchrone non effectué",
            fn: () => {
              throw panne
            },
          },
          {
            effet: "invalidation-cache",
            entite: { type: "produit", id: "produit-1" },
            message: "effet suivant",
            fn: suivant,
          },
        ],
        journal
      )
    ).resolves.toBeUndefined()

    expect(suivant).toHaveBeenCalledOnce()
    expect(journal.mesures).toEqual([
      {
        effet: "reindexation",
        entite: { type: "produit", id: "produit-1" },
        resultat: "echec",
        dureeMs: expect.any(Number),
        message: "effet synchrone non effectué",
        erreur: "effet synchrone indisponible",
      },
      {
        effet: "invalidation-cache",
        entite: { type: "produit", id: "produit-1" },
        resultat: "succes",
        dureeMs: expect.any(Number),
        message: "effet suivant",
      },
    ])
  })

  it("continue après un rejet asynchrone et journalise chaque échec", async () => {
    const journal = creerJournalEffetsMemoire()
    const premierePanne = new Error("premier effet asynchrone indisponible")
    const secondePanne = new Error("second effet asynchrone indisponible")
    const apresRejet = vi.fn()
    const dernier = vi.fn()

    await expect(
      runOrderedEffects(
        [
          {
            effet: "email",
            entite: { type: "commande", id: "commande-1" },
            message: "premier rejet asynchrone",
            fn: async () => {
              throw premierePanne
            },
          },
          {
            effet: "invalidation-cache",
            entite: { type: "commande", id: "commande-1" },
            message: "effet après le rejet",
            fn: apresRejet,
          },
          {
            effet: "purge-catalogue",
            entite: { type: "commande", id: "commande-1" },
            message: "second rejet asynchrone",
            fn: () => Promise.reject(secondePanne),
          },
          {
            effet: "invalidation-cache",
            entite: { type: "commande", id: "commande-1" },
            message: "dernier effet",
            fn: dernier,
          },
        ],
        journal
      )
    ).resolves.toBeUndefined()

    expect(apresRejet).toHaveBeenCalledOnce()
    expect(dernier).toHaveBeenCalledOnce()
    expect(journal.mesures.map((mesure) => mesure.resultat)).toEqual([
      "echec",
      "succes",
      "echec",
      "succes",
    ])
    expect(journal.mesures[0]).toMatchObject({
      message: "premier rejet asynchrone",
      erreur: "premier effet asynchrone indisponible",
    })
    expect(journal.mesures[2]).toMatchObject({
      message: "second rejet asynchrone",
      erreur: "second effet asynchrone indisponible",
    })
  })

  it("résout après des effets réussis", async () => {
    const journal = creerJournalEffetsMemoire()
    const premier = vi.fn(async () => {})
    const second = vi.fn(() => {})

    await expect(
      runOrderedEffects(
        [
          {
            effet: "reindexation",
            entite: { type: "produit", id: "produit-1" },
            message: "premier effet",
            fn: premier,
          },
          {
            effet: "invalidation-cache",
            entite: { type: "produit", id: "produit-1" },
            message: "second effet",
            fn: second,
          },
        ],
        journal
      )
    ).resolves.toBeUndefined()

    expect(premier).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    expect(journal.mesures).toHaveLength(2)
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
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
