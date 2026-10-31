import { describe, expect, it } from "vitest"

import {
  STATUTS_EXECUTION,
  construireUrlExecutions,
  parseFiltresExecutions,
} from "@/lib/automatisations-listing"

describe("la grammaire d'URL de l'historique des exécutions", () => {
  it("lit le statut, la règle et la date de départ", () => {
    expect(
      parseFiltresExecutions({
        statut: "echoue",
        regle: "statut-commande",
        depuis: "2026-10-21",
      })
    ).toEqual({
      statut: "echoue",
      regleId: "statut-commande",
      depuis: new Date("2026-10-21T00:00:00.000Z"),
    })
  })

  it("refuse ce qui n'appartient pas au vocabulaire plutôt que de filtrer au hasard", () => {
    expect(
      parseFiltresExecutions({
        statut: "peut-etre",
        regle: "",
        depuis: "21/10/2026",
      })
    ).toEqual({ statut: null, regleId: null, depuis: null })
    expect(parseFiltresExecutions({ depuis: "2026-02-31" })).toEqual({
      statut: null,
      regleId: null,
      depuis: null,
    })
  })

  it("accepte plusieurs valeurs et retient la première", () => {
    expect(
      parseFiltresExecutions({
        statut: ["ignore", "echoue"],
        regle: ["a", "b"],
      })
    ).toEqual({ statut: "ignore", regleId: "a", depuis: null })
  })

  it("n'admet que les statuts qu'une Exécution peut prendre", () => {
    expect([...STATUTS_EXECUTION]).toEqual([
      "en_cours",
      "reussi",
      "echoue",
      "ignore",
    ])
    for (const statut of ["en_attente", "mort"]) {
      expect(parseFiltresExecutions({ statut })).toEqual({
        statut: null,
        regleId: null,
        depuis: null,
      })
    }
  })

  it("se reconstruit à l'identique, et n'écrit rien quand rien n'est filtré", () => {
    const filtres = {
      statut: "echoue" as const,
      regleId: "statut-commande",
      depuis: new Date("2026-10-21T00:00:00.000Z"),
    }
    expect(construireUrlExecutions(filtres)).toBe(
      "?statut=echoue&regle=statut-commande&depuis=2026-10-21"
    )
    expect(
      parseFiltresExecutions({
        statut: "echoue",
        regle: "statut-commande",
        depuis: "2026-10-21",
      })
    ).toEqual(filtres)
    expect(
      construireUrlExecutions({ statut: null, regleId: null, depuis: null })
    ).toBe("")
  })
})
