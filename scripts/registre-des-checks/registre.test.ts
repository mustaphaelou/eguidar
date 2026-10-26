import { describe, expect, it } from "vitest"

import {
  comparerLesChecks,
  contextesDeclares,
  ErreurDeLectureDuRuleset,
  estRefusDeDroits,
  exigerLeRulesetDuDepot,
  jugerLeRuleset,
} from "./registre"

const SOURCE = "GET https://une-api.example/que-ce-depot-na-pas-appelle"

const DECLARES = ["lint", "format", "typecheck", "test", "build"]

const EXIGES = ["lint", "typecheck", "test", "build"]

const RESUME = {
  id: 23_223_443,
  name: "main-protection",
  target: "branch",
  source_type: "Repository",
  source: "mustaphaelou/eguidar",
  enforcement: "active",
}

function ruleset(contextes: string[]): Record<string, unknown> {
  return {
    ...RESUME,
    conditions: { ref_name: { exclude: [], include: ["refs/heads/main"] } },
    rules: [
      {
        type: "pull_request",
        parameters: { required_approving_review_count: 0 },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          do_not_enforce_on_create: false,
          required_status_checks: contextes.map((context) => ({ context })),
        },
      },
    ],
  }
}

function raisonDe(chargeUtile: unknown): string | null {
  const lecture = jugerLeRuleset(chargeUtile, SOURCE)
  return lecture.lisible ? null : lecture.raison
}

describe("la comparaison des deux listes", () => {
  it("ne trouve aucun écart entre deux listes égales", () => {
    expect(comparerLesChecks(DECLARES, DECLARES)).toEqual({
      nonExigés: [],
      sansJob: [],
    })
  })

  it("nomme le check que le flux déclare et que le ruleset n'exige pas", () => {
    expect(comparerLesChecks(DECLARES, EXIGES)).toEqual({
      nonExigés: ["format"],
      sansJob: [],
    })
  })

  it("nomme l'exigence que le ruleset porte et qu'aucun job ne fournit", () => {
    expect(
      comparerLesChecks(
        ["lint", "format", "typecheck", "build"],
        ["lint", "format", "typecheck", "build", "verifie"]
      )
    ).toEqual({ nonExigés: [], sansJob: ["verifie"] })
  })

  it("les nomme tous les deux quand les deux listes ont dérivé en même temps", () => {
    expect(
      comparerLesChecks(["lint", "format", "test"], ["lint", "test", "vieux"])
    ).toEqual({ nonExigés: ["format"], sansJob: ["vieux"] })
  })

  it("garde l'ordre de chaque liste, pour que le message se lise comme elle", () => {
    expect(comparerLesChecks(["b", "a", "c"], ["c", "b"])).toEqual({
      nonExigés: ["a"],
      sansJob: [],
    })
    expect(comparerLesChecks(["b", "a"], ["z", "y", "x"])).toEqual({
      nonExigés: ["b", "a"],
      sansJob: ["z", "y", "x"],
    })
  })
})

describe("le côté déclaré", () => {
  it("nomme les jobs du flux, et non les checks qu'ils invoquent", () => {
    expect(contextesDeclares()).toEqual(DECLARES)
    expect(contextesDeclares()).not.toContain("format:check")
  })
})

describe("le choix du ruleset du dépôt", () => {
  it("prend celui du dépôt quand la liste en mêle un d'organisation", () => {
    const deOrganisation = { ...RESUME, id: 99, source_type: "Organization" }
    const liste = [deOrganisation, RESUME]

    expect(exigerLeRulesetDuDepot(liste, SOURCE)).toEqual({
      id: 23_223_443,
      nom: "main-protection",
    })
    expect(exigerLeRulesetDuDepot([RESUME, deOrganisation], SOURCE)).toEqual({
      id: 23_223_443,
      nom: "main-protection",
    })
  })

  it("refuse une liste qui ne porte aucun ruleset de dépôt, et le dit", () => {
    expect(() =>
      exigerLeRulesetDuDepot(
        [{ ...RESUME, source_type: "Organization" }],
        SOURCE
      )
    ).toThrow(
      `${SOURCE} : aucun ruleset \`source_type: "Repository"\`, donc aucune exigence de statut`
    )
  })

  it("refuse de deviner entre deux rulesets de dépôt, et nomme les candidats", () => {
    expect(() =>
      exigerLeRulesetDuDepot(
        [RESUME, { ...RESUME, id: 1, name: "release-protection" }],
        SOURCE
      )
    ).toThrow(
      `${SOURCE} : 2 rulesets de dépôt (« main-protection », « release-protection ») ; ce module ne sait pas lequel lire`
    )
  })

  it("refuse une réponse qui n'est pas une liste, et le dit", () => {
    expect(() =>
      exigerLeRulesetDuDepot({ message: "Not Found" }, SOURCE)
    ).toThrow(`${SOURCE} : la réponse n'est pas une liste de rulesets`)
  })
})

describe("la lecture d'un ruleset", () => {
  it("rend les exigences d'un ruleset qu'elle sait lire, et se tait", () => {
    expect(jugerLeRuleset(ruleset(EXIGES), SOURCE)).toEqual({
      lisible: true,
      exigences: {
        nom: "main-protection",
        contextes: EXIGES,
        exigeBrancheAJour: true,
        suspendLExigenceALaCreation: false,
      },
    })
  })

  it("refuse un ruleset sans règle de statuts, et le dit", () => {
    const sansRegle = { ...RESUME, rules: [{ type: "pull_request" }] }
    expect(raisonDe(sansRegle)).toBe(
      `${SOURCE} (ruleset « main-protection ») : aucune règle \`required_status_checks\`, donc aucune porte n'est exigée`
    )
  })

  it("refuse une charge utile qui ne dit pas quels statuts elle exige", () => {
    const sansContextes = {
      ...RESUME,
      rules: [{ type: "required_status_checks", parameters: {} }],
    }
    expect(raisonDe(sansContextes)).toBe(
      `${SOURCE} (ruleset « main-protection ») : la règle \`required_status_checks\` ne dit pas quels statuts elle exige`
    )
  })

  it("refuse un drapeau qu'elle ne sait pas lire plutôt que de le supposer", () => {
    const sansDrapeaux = {
      ...RESUME,
      rules: [
        {
          type: "required_status_checks",
          parameters: { required_status_checks: [{ context: "lint" }] },
        },
      ],
    }
    expect(raisonDe(sansDrapeaux)).toBe(
      `${SOURCE} (ruleset « main-protection ») : \`strict_required_status_checks_policy\` n'est pas un booléen`
    )
  })

  it("refuse un statut exigé sans contexte, et le dit", () => {
    const sansContexte = {
      ...RESUME,
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
            required_status_checks: [{ nom: "lint" }],
          },
        },
      ],
    }
    expect(raisonDe(sansContexte)).toBe(
      `${SOURCE} (ruleset « main-protection ») : un statut exigé n'a pas de \`context\` lisible`
    )
  })

  it("refuse une charge utile qui n'est pas un ruleset, et le dit", () => {
    expect(raisonDe(null)).toBe(`${SOURCE} : clé \`name\` absente ou illisible`)
    expect(raisonDe({ message: "Not Found" })).toBe(
      `${SOURCE} : clé \`name\` absente ou illisible`
    )
  })
})

describe("le refus de lire les rulesets", () => {
  it("reconnaît un refus de droits et une ressource masquée", () => {
    expect(
      estRefusDeDroits(
        new ErreurDeLectureDuRuleset(
          `3 lectures du ruleset ont échoué, la dernière dit : ${SOURCE} : HTTP 403 Forbidden`
        )
      )
    ).toBe(true)
    expect(
      estRefusDeDroits(
        new ErreurDeLectureDuRuleset(`${SOURCE} : HTTP 404 Not Found`)
      )
    ).toBe(true)
  })

  it("ne confond ni une panne, ni une autre erreur avec un refus de droits", () => {
    expect(
      estRefusDeDroits(
        new ErreurDeLectureDuRuleset(
          `${SOURCE} : HTTP 500 Internal Server Error`
        )
      )
    ).toBe(false)
    expect(estRefusDeDroits(new Error(`${SOURCE} : HTTP 403 Forbidden`))).toBe(
      false
    )
    expect(estRefusDeDroits(`${SOURCE} : HTTP 403 Forbidden`)).toBe(false)
  })
})
