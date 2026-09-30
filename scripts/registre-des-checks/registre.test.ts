import { describe, expect, it } from "vitest"

import {
  comparerLesChecks,
  contextesDeclares,
  exigerLeRulesetDuDepot,
  jugerLeRuleset,
} from "./registre"

/**
 * Le nom d'un endpoint que ce dépôt n'a pas. Il n'existe nulle part, et il ne
 * doit pas ressembler à une URL de l'API : c'est le seul moyen de prouver que
 * le message nomme la source que l'appelant a réellement lue, et non une
 * constante que le module connaît par cœur.
 */
const SOURCE = "GET https://une-api.example/que-ce-depot-na-pas-appelle"

/** Les cinq jobs du flux de ce dépôt, dans l'ordre du fichier. */
const DECLARES = ["lint", "format", "typecheck", "test", "build"]

/**
 * Des exigences qui ne sont pas celles des jobs déclarés : quatre des cinq,
 * `format` en moins. Cette liste est fabriquée, et ne prétend rien des réglages
 * que ce dépôt porte : la comparaison n'a rien à prouver sur deux listes égales,
 * où une fonction qui rend toujours deux listes vides passerait aussi
 * facilement qu'une fonction juste. Il lui faut des listes qui divergent
 * vraiment — et celle-ci diverge dans le sens qui a le plus dormi, un job vert
 * partout que rien n'attend devant la fusion.
 */
const EXIGES = ["lint", "typecheck", "test", "build"]

/**
 * Un résumé de rulesets, tel que l'API les rend. Le résumé ne porte aucun
 * `rules` : c'est mesuré, et c'est pourquoi la lecture est en deux appels.
 */
const RESUME = {
  id: 23_223_443,
  name: "main-protection",
  target: "branch",
  source_type: "Repository",
  source: "mustaphaelou/eguidar",
  enforcement: "active",
}

/** Un ruleset complet, avec la règle qui porte les statuts. */
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

/**
 * Le verdict, tel que l'appelant le reçoit : jamais une exception, toujours un
 * « lisible » ou non et la raison qui l'accompagne. Rendre la raison plutôt
 * que relever l'erreur par `toThrow` permet d'ancrer chaque forme à la phrase
 * exacte qu'elle mérite, comme le fait `ci-liste-lecture.test.ts`.
 */
function raisonDe(chargeUtile: unknown): string | null {
  const lecture = jugerLeRuleset(chargeUtile, SOURCE)
  return lecture.lisible ? null : lecture.raison
}

describe("la comparaison des deux listes", () => {
  it("ne trouve aucun écart entre deux listes égales", () => {
    // Témoin de non-vacuité, comme toujours : une comparaison qui rendrait
    // toujours deux listes vides passerait cette assertion aussi facilement
    // qu'une comparaison juste. Les deux listes sont ici celles du dépôt, et
    // les deux égalités sont vraies.
    expect(comparerLesChecks(DECLARES, DECLARES)).toEqual({
      nonExigés: [],
      sansJob: [],
    })
  })

  it("nomme le check que le flux déclare et que le ruleset n'exige pas", () => {
    // Le sens de cet écart ne se voit pas à l'œil : `format` est bien exécuté
    // par la CI, et son job est bien vert. Il n'est seulement pas exigé, donc
    // rien ne l'attend devant la fusion. C'est la dérive qui a eu lieu, et c'est
    // le seul des deux sens que la contenance aurait laissé passer.
    expect(comparerLesChecks(DECLARES, EXIGES)).toEqual({
      nonExigés: ["format"],
      sansJob: [],
    })
  })

  it("nomme l'exigence que le ruleset porte et qu'aucun job ne fournit", () => {
    // L'autre sens : un job supprimé laisse dans le ruleset une exigence que
    // plus rien ne satisfait, et la pull request se bloque sans raison. Un job
    // renommé fait la même chose sous un autre nom — c'est le même écart.
    expect(
      comparerLesChecks(
        ["lint", "format", "typecheck", "build"],
        ["lint", "format", "typecheck", "build", "verifie"]
      )
    ).toEqual({ nonExigés: [], sansJob: ["verifie"] })
  })

  it("les nomme tous les deux quand les deux listes ont dérivé en même temps", () => {
    // Les deux dérives à la fois : une porte ajoutée au flux, une exigence
    // laissée sur un job disparu. C'est le seul cas que les deux sens ne
    // déduisent pas l'un de l'autre, et le seul où un message qui n'en nommerait
    // qu'un laisserait passer l'autre.
    expect(
      comparerLesChecks(["lint", "format", "test"], ["lint", "test", "vieux"])
    ).toEqual({ nonExigés: ["format"], sansJob: ["vieux"] })
  })

  it("garde l'ordre de chaque liste, pour que le message se lise comme elle", () => {
    // L'ordre n'est pas un détail : le message du test se construit dans cet
    // ordre, et un écart nommé dans un ordre que personne n'a demandé ne se
    // compare plus à rien de lisible.
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
    // Le point de bascule de tout le module : le contexte que GitHub enregistre
    // est le nom du job, donc c'est le nom du job que le ruleset doit porter.
    // Rendre les noms de scripts à la place donnerait `format:check` là où le
    // ruleset doit dire `format`, et l'écart ne pourrait jamais se fermer.
    expect(contextesDeclares()).toEqual(DECLARES)
    expect(contextesDeclares()).not.toContain("format:check")
  })
})

describe("le choix du ruleset du dépôt", () => {
  it("prend celui du dépôt quand la liste en mêle un d'organisation", () => {
    // La forme que l'API rend déjà, et qu'elle rendra un jour de plus : un
    // ruleset d'organisation arrive dans la même liste. Le prendre pour le nôtre
    // ferait porter l'assertion sur les réglages d'un autre dépôt — un
    // `--include-parent` que ce module ne demande pas et que GitHub applique
    // par défaut.
    const deOrganisation = { ...RESUME, id: 99, source_type: "Organization" }
    const liste = [deOrganisation, RESUME]

    expect(exigerLeRulesetDuDepot(liste, SOURCE)).toEqual({
      id: 23_223_443,
      nom: "main-protection",
    })
    // L'ordre est indifférent à la réponse, et le test le prouve en donnant les
    // deux : un ruleset d'organisation qui se glisse en premier ne doit pas non
    // plus gagner.
    expect(exigerLeRulesetDuDepot([RESUME, deOrganisation], SOURCE)).toEqual({
      id: 23_223_443,
      nom: "main-protection",
    })
  })

  it("refuse une liste qui ne porte aucun ruleset de dépôt, et le dit", () => {
    // Aucun ruleset du dépôt n'est le trou le plus profond que ce module
    // puisse rencontrer : rien n'est exigé, et la comparaison le dirait en
    // nommant cinq portes à ajouter à des réglages qui n'existent pas.
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
    // Le cas qu'un « prends le premier » aurait tranché sans le dire. Les deux
    // noms sont dans le message : c'est une décision à prendre, pas un problème
    // à contourner en triant.
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
    // Témoin de non-vacuité, dans les deux sens : un `jugerLeRuleset` qui
    // répondrait toujours « illisible » passerait les cas suivants aussi
    // facilement qu'un qui lit. La charge utile est celle que l'API rend,
    // mesurée.
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
    // Le piège que la forme seule ne montre pas : un ruleset sans
    // `required_status_checks` n'exige rien, et se lirait « le flux déclare cinq
    // portes, le ruleset n'en exige aucune » — un écart réel, mais qui
    // enverrait à ajouter cinq portes à des réglages qui n'en ont pas.
    const sansRegle = { ...RESUME, rules: [{ type: "pull_request" }] }
    expect(raisonDe(sansRegle)).toBe(
      `${SOURCE} (ruleset « main-protection ») : aucune règle \`required_status_checks\`, donc aucune porte n'est exigée`
    )
  })

  it("refuse une charge utile qui ne dit pas quels statuts elle exige", () => {
    // La forme que prendrait une réponse tronquée, et celle que prendrait une
    // API qui aurait déplacé la clé : dans les deux cas, aucun statut n'est
    // lisible, et l'assertion ne doit pas le croire.
    const sansContextes = {
      ...RESUME,
      rules: [{ type: "required_status_checks", parameters: {} }],
    }
    expect(raisonDe(sansContextes)).toBe(
      `${SOURCE} (ruleset « main-protection ») : la règle \`required_status_checks\` ne dit pas quels statuts elle exige`
    )
  })

  it("refuse un drapeau qu'elle ne sait pas lire plutôt que de le supposer", () => {
    // `strict_required_status_checks_policy` manquant ne doit pas se lire « le
    // ruleset est strict », ni `do_not_enforce_on_create` manquant « le ruleset
    // n'en suspend pas ». Une valeur inventée ne se contredit plus, et une porte
    // qui ne se contredit plus est une porte verte.
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
