import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { type FaitsDuRuleset } from "@/infra/porte-de-fusion"
import { checksDuFlux } from "@/scripts/ci-liste"
import {
  API,
  CONTEXTES_VIVANTS,
  CONTRAT,
  DEPOT,
  ok,
  reglePull,
  regleStatuts,
  resume,
  ruleset,
  type ReponseHttp,
} from "@/test/porte-de-fusion-fixtures"

import {
  REMEDE_DU_JETON,
  REMEDE_PLAN_OU_VISIBILITE,
  type DependancesDeLecture,
} from "./lecture-du-ruleset"
import {
  codeDeSortie,
  verifierLaPorte,
  verdictDeLaLecture,
  type VerdictDeLaPorte,
} from "./verifier"

const RACINE = path.resolve(import.meta.dirname, "../..")

const SCRIPT = path.join(import.meta.dirname, "verifier.ts")

const LANCEUR = createRequire(import.meta.url).resolve("tsx/cli")

function environnement(valeurs: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...valeurs }
}

const ENV_DE_TEST = environnement({
  GITHUB_REPOSITORY: DEPOT,
  GH_TOKEN: "jeton-de-test",
})

const FAITS_CONFORMES: FaitsDuRuleset = {
  nom: "main-protection",
  branchesIncluses: ["refs/heads/main"],
  branchesExclues: [],
  contextes: [...CONTEXTES_VIVANTS],
  exigeBrancheAJour: true,
  suspendLExigenceALaCreation: false,
  pullRequestRequise: true,
  revueRequise: false,
  contournement: [],
}

type Route = ReponseHttp | (() => ReponseHttp)

type FauxServeur = {
  recuperer: DependancesDeLecture["recuperer"]
  urls: string[]
}

function fauxServeur(
  liste: Route,
  details: Record<number, Route> = {}
): FauxServeur {
  const urls: string[] = []

  return {
    urls,
    recuperer: async (url) => {
      urls.push(url)
      const route =
        url === API ? liste : details[Number(url.slice(API.length + 1))]

      if (route === undefined) {
        throw new Error(`aucune réponse prévue pour ${url}`)
      }
      return typeof route === "function" ? route() : route
    },
  }
}

type Sortie = {
  code: 0 | 1 | 2
  sortie: string
}

async function lancer(
  serveur: FauxServeur,
  options: {
    env?: NodeJS.ProcessEnv
    executer?: DependancesDeLecture["executer"]
    attendre?: DependancesDeLecture["attendre"]
  } = {}
): Promise<Sortie> {
  const lignes: string[] = []
  const code = await verifierLaPorte({
    lireContrat: () => CONTRAT,
    lecture: {
      env: options.env ?? ENV_DE_TEST,
      executer:
        options.executer ??
        (() => {
          throw new Error("gh ne doit pas être appelé dans ce cas")
        }),
      recuperer: serveur.recuperer,
      attendre: options.attendre ?? (async () => {}),
    },
    ecrire: (texte) => {
      lignes.push(texte)
    },
    ecrireErreur: (texte) => {
      lignes.push(texte)
    },
  })

  return { code, sortie: lignes.join("\n") }
}

describe("le verdict de la porte et son code de sortie", () => {
  it("rend conforme quand la porte et les faits s'accordent", () => {
    expect(
      verdictDeLaLecture(CONTRAT, { lisible: true, faits: FAITS_CONFORMES })
    ).toEqual({ etat: "conforme", nom: "main-protection" })
  })

  it("rend les écarts quand les faits vivants dérivent", () => {
    expect(
      verdictDeLaLecture(CONTRAT, {
        lisible: true,
        faits: { ...FAITS_CONFORMES, pullRequestRequise: false },
      })
    ).toEqual({
      etat: "derive",
      nom: "main-protection",
      ecarts: [{ fait: "pull request requise", attendu: "oui", trouve: "non" }],
    })
  })

  it("rend illisible sans inventer d'écart", () => {
    expect(
      verdictDeLaLecture(CONTRAT, {
        lisible: false,
        raison: "panne de lecture",
      })
    ).toEqual({ etat: "illisible", raison: "panne de lecture" })
  })

  const CAS: { verdict: VerdictDeLaPorte; nom: string; code: 0 | 1 | 2 }[] = [
    {
      nom: "conforme",
      verdict: { etat: "conforme", nom: "main-protection" },
      code: 0,
    },
    {
      nom: "dérivé",
      verdict: { etat: "derive", nom: "main-protection", ecarts: [] },
      code: 1,
    },
    {
      nom: "illisible",
      verdict: { etat: "illisible", raison: "plan ou visibilité" },
      code: 2,
    },
  ]

  it.each(CAS)(
    "mappe l'état « $nom » sur le code $code",
    ({ verdict, code }) => {
      expect(codeDeSortie(verdict)).toBe(code)
    }
  )
})

describe("le docteur sur un ruleset vivant", () => {
  it("sort 0 et le dit quand le ruleset porte les faits du contrat", async () => {
    const serveur = fauxServeur(ok([resume(1, "main-protection")]), {
      1: ok(ruleset()),
    })

    const { code, sortie } = await lancer(serveur)

    expect(code).toBe(0)
    expect(sortie).toContain("conforme")
    expect(sortie).toContain("main-protection")
  })

  it("ignore les règles non liées, les identifiants, versions et horodatages", async () => {
    const serveur = fauxServeur(ok([resume(1, "main-protection")]), {
      1: ok(
        ruleset({
          id: 77,
          node_id: "un-autre-noeud",
          created_at: "2020-01-01T00:00:00Z",
          updated_at: "2030-12-31T23:59:59Z",
          _links: { self: { href: `${API}/77` } },
          rules: [
            { type: "deletion" },
            { type: "non_fast_forward" },
            { type: "creation" },
            reglePull(),
            regleStatuts(),
          ],
        })
      ),
    })

    const { code } = await lancer(serveur)

    expect(code).toBe(0)
  })

  it("sort 1 et imprime les faits divergents quand le ruleset dérive", async () => {
    const serveur = fauxServeur(ok([resume(1, "main-protection")]), {
      1: ok(
        ruleset({
          rules: [
            regleStatuts({
              do_not_enforce_on_create: true,
              required_status_checks: CONTEXTES_VIVANTS.filter(
                (context) => context !== "format"
              ).map((context) => ({ context })),
            }),
          ],
        })
      ),
    })

    const { code, sortie } = await lancer(serveur)

    expect(code).toBe(1)
    expect(sortie).toContain("dérivé")
    expect(sortie).toContain(
      "« contextes exigés » : attendu « build, format, lint, test, typecheck », trouvé « build, lint, test, typecheck »."
    )
    expect(sortie).toContain(
      "« exigence suspendue à la création » : attendu « non », trouvé « oui »."
    )
    expect(sortie).toContain(
      "« pull request requise » : attendu « oui », trouvé « non »."
    )
  })

  it("accepte un ruleset dont le nom diffère : le nom n'est pas un fait de porte", async () => {
    const serveur = fauxServeur(ok([resume(1, "protection-renommee")]), {
      1: ok(ruleset({ name: "protection-renommee" })),
    })

    const { code } = await lancer(serveur)

    expect(code).toBe(0)
  })

  it("départage deux candidats par le nom du contrat, sans le comparer", async () => {
    const serveur = fauxServeur(
      ok([resume(1, "autre-protection"), resume(2, "main-protection")]),
      {
        1: ok(ruleset({ id: 1, name: "autre-protection" })),
        2: ok(ruleset({ id: 2, name: "main-protection" })),
      }
    )

    const { code } = await lancer(serveur)

    expect(code).toBe(0)
  })

  it("sort 2 et nomme les candidats quand plusieurs rulesets couvrent la branche", async () => {
    const serveur = fauxServeur(ok([resume(1, "alpha"), resume(2, "beta")]), {
      1: ok(ruleset({ id: 1, name: "alpha" })),
      2: ok(ruleset({ id: 2, name: "beta" })),
    })

    const { code, sortie } = await lancer(serveur)

    expect(code).toBe(2)
    expect(sortie).toContain("« alpha »")
    expect(sortie).toContain("« beta »")
    expect(sortie).toContain("pas une dérive")
  })
})

describe("le docteur sur une porte illisible", () => {
  it.each([403, 404])(
    "sort 2 et nomme le remède plan ou visibilité sur HTTP %d",
    async (statut) => {
      const serveur = fauxServeur({
        statut,
        corps: { message: "Upgrade to GitHub Pro" },
      })

      const { code, sortie } = await lancer(serveur)

      expect(code).toBe(2)
      expect(sortie).toContain(REMEDE_PLAN_OU_VISIBILITE)
      expect(sortie).toContain("pas une dérive")
    }
  )

  it("sort 2 sur des tentatives épuisées, jamais 1", async () => {
    const pauses: number[] = []
    const serveur = fauxServeur({ statut: 500, corps: null })

    const { code, sortie } = await lancer(serveur, {
      attendre: async (pause) => {
        pauses.push(pause)
      },
    })

    expect(code).toBe(2)
    expect(sortie).toContain("3 lectures")
    expect(sortie).toContain("pas une dérive")
    expect(pauses).toEqual([500, 1500])
  })

  it("sort 2 sans jeton, avant tout appel réseau, et nomme le remède", async () => {
    const serveur = fauxServeur(ok([]))

    const { code, sortie } = await lancer(serveur, {
      env: environnement({ GITHUB_REPOSITORY: DEPOT }),
      executer: () => {
        throw new Error("gh n'est pas connecté")
      },
    })

    expect(code).toBe(2)
    expect(sortie).toContain(REMEDE_DU_JETON)
    expect(sortie).toContain("pas une dérive")
    expect(serveur.urls).toEqual([])
  })
})

describe("le docteur reste local et en lecture seule", () => {
  it("n'est invoqué ni par scripts/checks.sh ni par le flux CI", () => {
    const scripts = readFileSync(
      path.join(RACINE, "scripts", "checks.sh"),
      "utf8"
    )
    const flux = readFileSync(
      path.join(RACINE, ".github", "workflows", "ci.yml"),
      "utf8"
    )

    expect(scripts).not.toContain("porte:verifier")
    expect(flux).not.toContain("porte:verifier")
    expect(checksDuFlux()).not.toContain("porte:verifier")
  })

  it("est déclaré dans le manifeste comme commande manuelle", () => {
    const manifeste = JSON.parse(
      readFileSync(path.join(RACINE, "package.json"), "utf8")
    ) as { scripts: Record<string, string> }

    expect(manifeste.scripts["porte:verifier"]).toBe(
      "tsx scripts/porte-de-fusion/verifier.ts"
    )
  })

  it("n'expose aucune méthode d'écriture vers GitHub", () => {
    for (const fichier of [
      path.join(import.meta.dirname, "verifier.ts"),
      path.join(import.meta.dirname, "lecture-du-ruleset.ts"),
    ]) {
      const source = readFileSync(fichier, "utf8")
      expect(source).not.toMatch(/\b(?:PUT|POST|PATCH|DELETE)\b/)
    }
  })

  it("sort 2 quand le CLI est lancé sans jeton, sans toucher au réseau", () => {
    const execution = spawnSync(process.execPath, [LANCEUR, SCRIPT], {
      cwd: RACINE,
      env: environnement({
        GITHUB_REPOSITORY: DEPOT,
        PATH: "/nonexistent",
      }),
      encoding: "utf8",
      timeout: 30_000,
    })

    expect(execution.status).toBe(2)
    expect(`${execution.stdout}${execution.stderr}`).toContain(REMEDE_DU_JETON)
  })
})
