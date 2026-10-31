import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  analyserLaPorteDeFusion,
  comparerLaPorteAuxFaits,
  comparerLesContextesDeLaPorte,
  ErreurDePorteDeFusion,
  lireLaPorteDeFusion,
  messagesDesEcartsDeContextes,
  phraseDeLEcart,
  type FaitsDuRuleset,
  type PorteDeFusion,
} from "@/infra/porte-de-fusion"
import { lireLesJobs } from "@/scripts/ci-liste"

const SOURCE = "infra/porte-de-fusion.json"

const NOM_DU_CONTRAT = "main-protection"

const CONTEXTES = ["build", "format", "lint", "test", "typecheck"]

const CONTRAT: PorteDeFusion = {
  nom: NOM_DU_CONTRAT,
  branche: "refs/heads/main",
  contextes: CONTEXTES,
  exigeBrancheAJour: true,
  suspendLExigenceALaCreation: false,
  pullRequestRequise: true,
  revueRequise: false,
  contournement: [],
}

const CLES = Object.keys(CONTRAT)

const BOOLEENS = [
  "exigeBrancheAJour",
  "suspendLExigenceALaCreation",
  "pullRequestRequise",
  "revueRequise",
]

function contrat(
  partiel: Record<string, unknown> = {}
): Record<string, unknown> {
  return { ...CONTRAT, ...partiel }
}

describe("l'analyse du contrat versionné", () => {
  it("accepte le contrat complet et rend chaque fait tel quel", () => {
    expect(analyserLaPorteDeFusion(contrat(), SOURCE)).toEqual(CONTRAT)
  })
})

describe("le refus d'un contrat malformé, clé par clé", () => {
  it.each(CLES)("refuse l'absence de « %s » et nomme la clé", (cle) => {
    const malformé = contrat()
    delete malformé[cle]

    expect(() => analyserLaPorteDeFusion(malformé, SOURCE)).toThrow(
      new ErreurDePorteDeFusion(
        `${SOURCE} : clé \`${cle}\` absente ou illisible`
      )
    )
  })

  it.each(BOOLEENS)(
    "refuse une valeur non booléenne pour « %s » et nomme la clé",
    (cle) => {
      expect(() =>
        analyserLaPorteDeFusion(contrat({ [cle]: "true" }), SOURCE)
      ).toThrow(`${SOURCE} : clé \`${cle}\` absente ou illisible`)
    }
  )

  it("refuse un nom vide et nomme la clé", () => {
    expect(() =>
      analyserLaPorteDeFusion(contrat({ nom: "   " }), SOURCE)
    ).toThrow(`${SOURCE} : clé \`nom\` absente ou illisible`)
  })

  it.each(["main", "heads/main", "refs/heads/"])(
    "refuse la branche « %s » et nomme la clé",
    (branche) => {
      expect(() =>
        analyserLaPorteDeFusion(contrat({ branche }), SOURCE)
      ).toThrow(
        `${SOURCE} : clé \`branche\` doit nommer \`refs/heads/<branche>\``
      )
    }
  )

  it("refuse des contextes qui ne sont pas une liste triée de noms", () => {
    const message = `${SOURCE} : clé \`contextes\` absente ou illisible`

    expect(() =>
      analyserLaPorteDeFusion(contrat({ contextes: "build" }), SOURCE)
    ).toThrow(message)
    expect(() =>
      analyserLaPorteDeFusion(contrat({ contextes: ["build", 42] }), SOURCE)
    ).toThrow(message)
  })

  it("refuse des contextes non triés et nomme la clé", () => {
    expect(() =>
      analyserLaPorteDeFusion(contrat({ contextes: ["lint", "build"] }), SOURCE)
    ).toThrow(`${SOURCE} : clé \`contextes\` non triée (attendu : build, lint)`)
  })

  it("refuse un contexte en double et nomme la clé", () => {
    expect(() =>
      analyserLaPorteDeFusion(
        contrat({ contextes: ["build", "build"] }),
        SOURCE
      )
    ).toThrow(`${SOURCE} : clé \`contextes\` avec le doublon « build »`)
  })

  it("refuse un contexte vide et nomme la clé", () => {
    expect(() =>
      analyserLaPorteDeFusion(contrat({ contextes: ["build", ""] }), SOURCE)
    ).toThrow(`${SOURCE} : clé \`contextes\` avec un contexte vide`)
  })

  it("refuse un contournement qui n'est pas une liste de noms non vides", () => {
    const message = `${SOURCE} : clé \`contournement\` absente ou illisible`

    expect(() =>
      analyserLaPorteDeFusion(contrat({ contournement: "équipe" }), SOURCE)
    ).toThrow(message)
    expect(() =>
      analyserLaPorteDeFusion(contrat({ contournement: [42] }), SOURCE)
    ).toThrow(message)
    expect(() =>
      analyserLaPorteDeFusion(contrat({ contournement: [""] }), SOURCE)
    ).toThrow(message)
  })

  it("refuse une valeur qui n'est pas un objet, sans inventer de fait", () => {
    for (const valeur of [null, [], "main-protection"]) {
      expect(() => analyserLaPorteDeFusion(valeur, SOURCE)).toThrow(
        new ErreurDePorteDeFusion(
          `${SOURCE} : la Porte de fusion n'est pas un objet`
        )
      )
    }
  })
})

describe("la comparaison des contextes aux jobs, sans réseau", () => {
  const porte = analyserLaPorteDeFusion(contrat(), SOURCE)

  it("ne trouve aucun écart quand les jobs fournissent les cinq contextes", () => {
    expect(comparerLesContextesDeLaPorte(porte, [...porte.contextes])).toEqual({
      nonExigés: [],
      sansJob: [],
    })
  })

  it("nomme le job que le contrat n'exige pas", () => {
    expect(
      comparerLesContextesDeLaPorte(porte, [...porte.contextes, "sonde"])
    ).toEqual({ nonExigés: ["sonde"], sansJob: [] })
  })

  it("nomme le contexte que le contrat exige et qu'aucun job ne fournit", () => {
    expect(
      comparerLesContextesDeLaPorte(
        porte,
        porte.contextes.filter((contexte) => contexte !== "format")
      )
    ).toEqual({ nonExigés: [], sansJob: ["format"] })
  })

  it("nomme les deux côtés quand le flux et le contrat ont dérivé ensemble", () => {
    const jobs = [
      ...porte.contextes.filter((contexte) => contexte !== "format"),
      "sonde",
    ]

    expect(comparerLesContextesDeLaPorte(porte, jobs)).toEqual({
      nonExigés: ["sonde"],
      sansJob: ["format"],
    })
  })

  it("garde l'ordre de chaque liste, pour que les messages se lisent comme elles", () => {
    const autre = analyserLaPorteDeFusion(
      contrat({ contextes: ["a", "b", "c"] }),
      SOURCE
    )

    expect(comparerLesContextesDeLaPorte(autre, ["z", "y", "x"])).toEqual({
      nonExigés: ["z", "y", "x"],
      sansJob: ["a", "b", "c"],
    })
  })
})

const FAITS_CONFORMES: FaitsDuRuleset = {
  nom: NOM_DU_CONTRAT,
  branchesIncluses: ["refs/heads/main"],
  branchesExclues: [],
  contextes: [...CONTEXTES].reverse(),
  exigeBrancheAJour: true,
  suspendLExigenceALaCreation: false,
  pullRequestRequise: true,
  revueRequise: false,
  contournement: [],
}

function faits(partiel: Partial<FaitsDuRuleset> = {}): FaitsDuRuleset {
  return { ...FAITS_CONFORMES, ...partiel }
}

describe("la comparaison de la porte aux faits vivants", () => {
  const porte = analyserLaPorteDeFusion(contrat(), SOURCE)

  it("ne trouve aucun écart quand le ruleset vivant porte les faits du contrat", () => {
    expect(comparerLaPorteAuxFaits(porte, faits())).toEqual([])
  })

  it("ignore le nom du ruleset vivant : il sélectionne, il ne se compare pas", () => {
    expect(
      comparerLaPorteAuxFaits(porte, faits({ nom: "un-autre-nom" }))
    ).toEqual([])
  })

  it("compare les contextes comme un ensemble, sans dépendre de leur ordre", () => {
    expect(
      comparerLaPorteAuxFaits(porte, faits({ contextes: [...CONTEXTES] }))
    ).toEqual([])
  })

  it("nomme les contextes qui diffèrent, dans l'ordre trié", () => {
    expect(
      comparerLaPorteAuxFaits(
        porte,
        faits({ contextes: ["build", "lint", "test", "typecheck"] })
      )
    ).toContainEqual({
      fait: "contextes exigés",
      attendu: "build, format, lint, test, typecheck",
      trouve: "build, lint, test, typecheck",
    })
  })

  it.each([
    ["branche à jour exigée", { exigeBrancheAJour: false }],
    ["exigence suspendue à la création", { suspendLExigenceALaCreation: true }],
    ["pull request requise", { pullRequestRequise: false }],
    ["revue requise", { revueRequise: true }],
  ] satisfies [string, Partial<FaitsDuRuleset>][])(
    "signale le fait « %s » quand le ruleset vivant le contredit",
    (fait, partiel) => {
      const ecarts = comparerLaPorteAuxFaits(porte, faits(partiel))

      expect(ecarts.map((ecart) => ecart.fait)).toEqual([fait])
      expect(ecarts[0]?.attendu).not.toBe(ecarts[0]?.trouve)
    }
  )

  it("rend une phrase française qui nomme le fait, l'attendu et le trouvé", () => {
    const [ecart] = comparerLaPorteAuxFaits(
      porte,
      faits({ exigeBrancheAJour: false })
    )

    expect(ecart).toEqual({
      fait: "branche à jour exigée",
      attendu: "oui",
      trouve: "non",
    })
    expect(phraseDeLEcart(ecart!)).toBe(
      "« branche à jour exigée » : attendu « oui », trouvé « non »."
    )
  })

  it("signale une branche couverte en trop et une branche exclue", () => {
    expect(
      comparerLaPorteAuxFaits(
        porte,
        faits({
          branchesIncluses: ["refs/heads/main", "refs/heads/release"],
          branchesExclues: ["refs/heads/main"],
        })
      )
    ).toEqual([
      {
        fait: "branches couvertes",
        attendu: "refs/heads/main",
        trouve: "refs/heads/main, refs/heads/release",
      },
      {
        fait: "branches exclues",
        attendu: "aucune",
        trouve: "refs/heads/main",
      },
    ])
  })

  it("signale un contournement non vide", () => {
    expect(
      comparerLaPorteAuxFaits(
        porte,
        faits({ contournement: ["Team 42 always"] })
      )
    ).toEqual([
      {
        fait: "contournements",
        attendu: "aucun",
        trouve: "Team 42 always",
      },
    ])
  })

  it("rend les écarts dans un ordre stable, pour que la sortie se lise toujours pareil", () => {
    const ecarts = comparerLaPorteAuxFaits(
      porte,
      faits({
        contextes: ["build"],
        pullRequestRequise: false,
        revueRequise: true,
      })
    )

    expect(ecarts.map((ecart) => ecart.fait)).toEqual([
      "contextes exigés",
      "pull request requise",
      "revue requise",
    ])
  })
})

function exigerLAccord(porte: PorteDeFusion, jobs: readonly string[]): void {
  const messages = messagesDesEcartsDeContextes(porte, jobs)
  if (messages.length > 0) throw new Error(messages.join("\n"))
}

describe("les faits de politique du contrat versionné", () => {
  const porte = lireLaPorteDeFusion()

  it("nomme le ruleset attendu, pour la sélection seulement", () => {
    expect(
      porte.nom,
      'le contrat doit garder `nom: "main-protection"` : c\'est le nom attendu du ruleset, utilisé pour le sélectionner et départager, jamais comparé comme fait de porte.'
    ).toBe(NOM_DU_CONTRAT)
  })

  it("couvre exactement la branche `refs/heads/main`", () => {
    expect(
      porte.branche,
      'le contrat doit garder `branche: "refs/heads/main"` : la porte couvre `main` et aucune autre branche.'
    ).toBe("refs/heads/main")
  })

  it("requiert exactement les cinq contextes, triés", () => {
    expect(
      porte.contextes,
      "le contrat doit garder exactement les cinq contextes triés : build, format, lint, test, typecheck. Ce test est leur seul propriétaire."
    ).toEqual(CONTEXTES)
  })

  it("exige une pull request", () => {
    expect(
      porte.pullRequestRequise,
      "le contrat doit garder `pullRequestRequise: true` : sans pull request, aucun statut n'est une condition de fusion."
    ).toBe(true)
  })

  it("exige une branche à jour avec `main`", () => {
    expect(
      porte.exigeBrancheAJour,
      "le contrat doit garder `exigeBrancheAJour: true` : sinon une branche en retard fusionne des statuts calculés sur un `main` dépassé."
    ).toBe(true)
  })

  it("n'exempte pas la création de la pull request", () => {
    expect(
      porte.suspendLExigenceALaCreation,
      "le contrat doit garder `suspendLExigenceALaCreation: false` : sinon une pull request peut fusionner avant que ses statuts aient couru."
    ).toBe(false)
  })

  it("n'exige aucune revue", () => {
    expect(
      porte.revueRequise,
      "le contrat doit garder `revueRequise: false` : la porte se prouve par les cinq statuts, sans approbation supplémentaire."
    ).toBe(false)
  })

  it("n'ouvre aucun contournement", () => {
    expect(
      porte.contournement,
      "le contrat doit garder `contournement: []` : un contournement permettrait de fusionner sans satisfaire la porte."
    ).toEqual([])
  })
})

describe("le contrat et les jobs du flux s'accordent dans les deux sens", () => {
  it("ne laisse ni job sans contexte requis, ni contexte sans job", () => {
    const porte = lireLaPorteDeFusion()
    const jobs = [...lireLesJobs().keys()]

    expect(() => exigerLAccord(porte, jobs)).not.toThrow()
  })

  it("échoue sur un sixième job, en nommant le contrat, le contexte et le correctif", () => {
    const porte = lireLaPorteDeFusion()
    const jobs = [...lireLesJobs().keys(), "sonde"]

    expect(() => exigerLAccord(porte, jobs)).toThrow(
      `Le contrat « main-protection » (${SOURCE}) n'exige pas le job « sonde » : ajoutez « sonde » à \`contextes\`, ou retirez le job du flux.`
    )
  })

  it("échoue sur un job retiré, en nommant le contrat et le contexte non fourni", () => {
    const porte = lireLaPorteDeFusion()
    const jobs = [...lireLesJobs().keys()].filter((nom) => nom !== "format")

    expect(() => exigerLAccord(porte, jobs)).toThrow(
      `Le contrat « main-protection » (${SOURCE}) exige le contexte « format » qu'aucun job du flux ne fournit : retirez « format » de \`contextes\`, ou ajoutez un job nommé « format » au flux.`
    )
  })

  it("échoue sur un job renommé, en nommant l'ancien et le nouveau contexte", () => {
    const porte = lireLaPorteDeFusion()
    const jobs = [...lireLesJobs().keys()].map((nom) =>
      nom === "format" ? "formatage" : nom
    )

    expect(() => exigerLAccord(porte, jobs)).toThrow(
      /n'exige pas le job « formatage »/
    )
    expect(() => exigerLAccord(porte, jobs)).toThrow(
      /exige le contexte « format » qu'aucun job du flux ne fournit/
    )
  })
})

describe("la comparaison reste pure et hors du flux", () => {
  it("n'importe ni HTTP, ni jeton, ni le lecteur du flux", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "porte-de-fusion.ts"),
      "utf8"
    )

    expect(source).not.toMatch(/node:(?:http|https|child_process)/)
    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).not.toMatch(/GITHUB_TOKEN|GH_TOKEN/)
    expect(source).not.toMatch(/ci-liste|ci\.yml|\.github/)
  })
})
