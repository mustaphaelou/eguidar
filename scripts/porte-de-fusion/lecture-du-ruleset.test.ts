import { describe, expect, it } from "vitest"

import { lireLaPorteDeFusion } from "@/infra/porte-de-fusion"

import {
  REMEDE_DU_DEPOT,
  REMEDE_DU_JETON,
  REMEDE_PLAN_OU_VISIBILITE,
  lireLaPorteVivante,
  type DependancesDeLecture,
  type LectureDeLaPorte,
  type ReponseHttp,
} from "./lecture-du-ruleset"

const CONTRAT = lireLaPorteDeFusion()

const DEPOT = "mustaphaelou/eguidar"

const API = `https://api.github.com/repos/${DEPOT}/rulesets`

// L'ordre que l'API rend aujourd'hui, différent du contrat trié : la lecture ne
// réordonne rien, la comparaison traite les contextes comme un ensemble.
const CONTEXTES_VIVANTS = ["lint", "format", "typecheck", "test", "build"]

function environnement(valeurs: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...valeurs }
}

const ENV_DE_TEST = environnement({
  GITHUB_REPOSITORY: DEPOT,
  GH_TOKEN: "jeton-de-test",
})

type Route = ReponseHttp | ((appel: number) => ReponseHttp)

type Routes = {
  liste: Route
  details?: Record<number, Route>
}

type FauxGithub = {
  recuperer: DependancesDeLecture["recuperer"]
  urls: string[]
}

function ok(corps: unknown): ReponseHttp {
  return { statut: 200, corps }
}

function resume(
  id: number,
  nom: string,
  sourceType = "Repository"
): Record<string, unknown> {
  return {
    id,
    name: nom,
    target: "branch",
    source_type: sourceType,
    source: DEPOT,
    enforcement: "active",
    created_at: "2026-09-14T00:03:44.667+01:00",
    updated_at: "2026-09-30T10:01:36.440+01:00",
  }
}

function reglePull(revues = 0): Record<string, unknown> {
  return {
    type: "pull_request",
    parameters: {
      required_approving_review_count: revues,
      dismiss_stale_reviews_on_push: false,
      require_code_owner_review: false,
      require_last_push_approval: false,
      required_review_thread_resolution: false,
    },
  }
}

function regleStatuts(
  partiel: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: "required_status_checks",
    parameters: {
      strict_required_status_checks_policy: true,
      do_not_enforce_on_create: false,
      required_status_checks: CONTEXTES_VIVANTS.map((context) => ({ context })),
      ...partiel,
    },
  }
}

function ruleset(
  partiel: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 23_223_443,
    node_id: "RRS_exemple",
    name: "main-protection",
    target: "branch",
    source_type: "Repository",
    source: DEPOT,
    enforcement: "active",
    conditions: {
      ref_name: { include: ["refs/heads/main"], exclude: [] },
    },
    bypass_actors: [],
    rules: [reglePull(), regleStatuts()],
    created_at: "2026-09-14T00:03:44.667+01:00",
    updated_at: "2026-09-30T10:01:36.440+01:00",
    _links: {
      self: { href: `${API}/23223443` },
      html: { href: "https://github.com/mustaphaelou/eguidar/rules/23223443" },
    },
    ...partiel,
  }
}

function fauxGithub(routes: Routes): FauxGithub {
  const urls: string[] = []

  return {
    urls,
    recuperer: async (url) => {
      urls.push(url)
      const appels = urls.filter((vue) => vue === url).length
      const route =
        url === API ? routes.liste : routes.details?.[identifiantDe(url)]

      if (route === undefined) {
        throw new Error(`aucune réponse prévue pour ${url}`)
      }
      return typeof route === "function" ? route(appels) : route
    },
  }
}

function identifiantDe(url: string): number {
  return Number(url.slice(API.length + 1))
}

function lecture(
  github: FauxGithub,
  surcharges: Partial<DependancesDeLecture> = {}
): Promise<LectureDeLaPorte> {
  return lireLaPorteVivante(CONTRAT, {
    env: ENV_DE_TEST,
    executer: () => {
      throw new Error("gh ne doit pas être appelé dans ce cas")
    },
    recuperer: github.recuperer,
    attendre: async () => {},
    ...surcharges,
  })
}

function raison(resultat: LectureDeLaPorte): string {
  if (resultat.lisible) {
    throw new Error("la lecture devait être illisible, elle a rendu des faits")
  }
  return resultat.raison
}

describe("la lecture du ruleset vivant", () => {
  it("lit le ruleset du dépôt qui couvre la branche et rend les faits du contrat", async () => {
    const github = fauxGithub({
      liste: ok([resume(23_223_443, "main-protection")]),
      details: { 23_223_443: ok(ruleset()) },
    })

    const resultat = await lecture(github)

    expect(resultat).toEqual({
      lisible: true,
      faits: {
        nom: "main-protection",
        branchesIncluses: ["refs/heads/main"],
        branchesExclues: [],
        contextes: CONTEXTES_VIVANTS,
        exigeBrancheAJour: true,
        suspendLExigenceALaCreation: false,
        pullRequestRequise: true,
        revueRequise: false,
        contournement: [],
      },
    })
    expect(github.urls).toEqual([API, `${API}/${23_223_443}`])
  })

  it("ignore les règles non liées, les identifiants, versions et horodatages", async () => {
    const sobre = fauxGithub({
      liste: ok([resume(23_223_443, "main-protection")]),
      details: { 23_223_443: ok(ruleset()) },
    })
    const bruyant = fauxGithub({
      liste: ok([resume(99, "main-protection")]),
      details: {
        99: ok(
          ruleset({
            id: 99,
            node_id: "un-autre-noeud",
            source: "un-autre/depot",
            created_at: "2020-01-01T00:00:00Z",
            updated_at: "2030-12-31T23:59:59Z",
            _links: { self: { href: `${API}/99` } },
            rules: [
              { type: "deletion" },
              { type: "non_fast_forward" },
              { type: "creation" },
              reglePull(),
              regleStatuts(),
            ],
          })
        ),
      },
    })

    const attendu = await lecture(sobre)
    const obtenu = await lecture(bruyant)

    expect(obtenu).toEqual(attendu)
    if (!attendu.lisible || !obtenu.lisible) {
      throw new Error("les deux rulesets devaient être lisibles")
    }
    expect(obtenu.faits).toEqual(attendu.faits)
  })

  it("lit l'absence de règle de pull request comme un fait, pas comme une panne", async () => {
    const github = fauxGithub({
      liste: ok([resume(23_223_443, "main-protection")]),
      details: { 23_223_443: ok(ruleset({ rules: [regleStatuts()] })) },
    })

    const resultat = await lecture(github)

    expect(resultat).toMatchObject({
      lisible: true,
      faits: { pullRequestRequise: false, revueRequise: false },
    })
  })

  it("lit une revue approuvante exigée comme une revue requise", async () => {
    const github = fauxGithub({
      liste: ok([resume(23_223_443, "main-protection")]),
      details: {
        23_223_443: ok(ruleset({ rules: [reglePull(1), regleStatuts()] })),
      },
    })

    expect(await lecture(github)).toMatchObject({
      lisible: true,
      faits: { pullRequestRequise: true, revueRequise: true },
    })
  })

  it("rend les acteurs de contournement lisibles pour la comparaison", async () => {
    const github = fauxGithub({
      liste: ok([resume(23_223_443, "main-protection")]),
      details: {
        23_223_443: ok(
          ruleset({
            bypass_actors: [
              { actor_id: 42, actor_type: "Team", bypass_mode: "always" },
            ],
          })
        ),
      },
    })

    expect(await lecture(github)).toMatchObject({
      lisible: true,
      faits: { contournement: ["Team 42 always"] },
    })
  })

  it("ne prend pas un ruleset d'organisation pour le ruleset du dépôt", async () => {
    const github = fauxGithub({
      liste: ok([
        resume(1, "regles-d-organisation", "Organization"),
        resume(2, "main-protection"),
      ]),
      details: { 2: ok(ruleset({ id: 2 })) },
    })

    const resultat = await lecture(github)

    expect(resultat).toMatchObject({
      lisible: true,
      faits: { nom: "main-protection" },
    })
    expect(github.urls).toEqual([API, `${API}/2`])
  })

  it("ne retient que les rulesets de dépôt qui couvrent la branche du contrat", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection"), resume(2, "release-seule")]),
      details: {
        1: ok(ruleset({ id: 1 })),
        2: ok(
          ruleset({
            id: 2,
            name: "release-seule",
            conditions: {
              ref_name: {
                include: ["refs/heads/release"],
                exclude: [],
              },
            },
          })
        ),
      },
    })

    expect(await lecture(github)).toMatchObject({
      lisible: true,
      faits: { nom: "main-protection" },
    })
  })

  it("traite une branche exclue comme non couverte", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: {
        1: ok(
          ruleset({
            conditions: {
              ref_name: {
                include: ["refs/heads/main"],
                exclude: ["refs/heads/main"],
              },
            },
          })
        ),
      },
    })

    expect(raison(await lecture(github))).toContain("refs/heads/main")
  })
})

describe("le choix du ruleset, par la branche puis par le nom du contrat", () => {
  it("déclare illisible quand aucun ruleset de dépôt ne couvre la branche, en la nommant", async () => {
    const github = fauxGithub({ liste: ok([]) })

    expect(raison(await lecture(github))).toContain(
      "aucun ruleset de dépôt ne couvre la branche `refs/heads/main`"
    )
    expect(github.urls).toEqual([API])
  })

  it("refuse de deviner entre plusieurs rulesets candidats et les nomme tous", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "alpha"), resume(2, "beta")]),
      details: {
        1: ok(ruleset({ id: 1, name: "alpha" })),
        2: ok(ruleset({ id: 2, name: "beta" })),
      },
    })

    const motif = raison(await lecture(github))

    expect(motif).toContain("`refs/heads/main`")
    expect(motif).toContain("« alpha »")
    expect(motif).toContain("« beta »")
  })

  it("départage plusieurs candidats par le nom du contrat, sans comparer ce nom", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "autre-protection"), resume(2, "main-protection")]),
      details: {
        1: ok(ruleset({ id: 1, name: "autre-protection" })),
        2: ok(ruleset({ id: 2, name: "main-protection" })),
      },
    })

    const resultat = await lecture(github)

    expect(resultat).toMatchObject({
      lisible: true,
      faits: { nom: "main-protection" },
    })
  })

  it("accepte un unique ruleset qui porte un autre nom, car le nom n'est pas un fait de porte", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "protection-renommee")]),
      details: { 1: ok(ruleset({ id: 1, name: "protection-renommee" })) },
    })

    expect(await lecture(github)).toMatchObject({
      lisible: true,
      faits: { nom: "protection-renommee" },
    })
  })
})

describe("les faits du ruleset qui ne sont pas lisibles", () => {
  function rulesetSansStatuts(): Record<string, unknown> {
    return ruleset({ rules: [reglePull()] })
  }

  it("déclare illisible un ruleset sans règle `required_status_checks`", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: { 1: ok(rulesetSansStatuts()) },
    })

    expect(raison(await lecture(github))).toContain("required_status_checks")
  })

  it.each([
    [
      "strict_required_status_checks_policy",
      { strict_required_status_checks_policy: "true" },
    ],
    ["do_not_enforce_on_create", { do_not_enforce_on_create: null }],
  ])(
    "déclare illisible un `%s` qui n'est pas un booléen",
    async (cle, parameters) => {
      const github = fauxGithub({
        liste: ok([resume(1, "main-protection")]),
        details: {
          1: ok(ruleset({ rules: [reglePull(), regleStatuts(parameters)] })),
        },
      })

      expect(raison(await lecture(github))).toContain(cle)
    }
  )

  it("déclare illisible un statut exigé sans `context`", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: {
        1: ok(
          ruleset({
            rules: [
              reglePull(),
              regleStatuts({
                required_status_checks: [{ context: "lint" }, {}],
              }),
            ],
          })
        ),
      },
    })

    expect(raison(await lecture(github))).toContain("context")
  })

  it("déclare illisible une condition de branche absente, jamais supposée", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: { 1: ok(ruleset({ conditions: {} })) },
    })

    expect(raison(await lecture(github))).toContain("branche")
  })

  it("déclare illisible `bypass_actors` absent, jamais supposé vide", async () => {
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: { 1: ok(ruleset({ bypass_actors: null })) },
    })

    expect(raison(await lecture(github))).toContain("bypass_actors")
  })

  it("réessaie une réponse illisible avant de la déclarer illisible, jamais dérivée", async () => {
    const pauses: number[] = []
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: { 1: ok(rulesetSansStatuts()) },
    })

    const resultat = await lecture(github, {
      attendre: async (pause) => {
        pauses.push(pause)
      },
    })

    expect(resultat.lisible).toBe(false)
    expect(pauses).toEqual([500, 1500])
    expect(github.urls).toEqual([
      API,
      `${API}/1`,
      API,
      `${API}/1`,
      API,
      `${API}/1`,
    ])
  })
})

describe("les pannes de lecture", () => {
  it.each([403, 404])(
    "classe HTTP %d en illisible immédiat, avec le remède plan ou visibilité",
    async (statut) => {
      const pauses: number[] = []
      const github = fauxGithub({
        liste: { statut, corps: { message: "Upgrade to GitHub Pro" } },
      })

      const resultat = await lecture(github, {
        attendre: async (pause) => {
          pauses.push(pause)
        },
      })

      expect(raison(resultat)).toContain(REMEDE_PLAN_OU_VISIBILITE)
      expect(github.urls).toHaveLength(1)
      expect(pauses).toEqual([])
    }
  )

  it("classe un 403 sur le détail en illisible immédiat", async () => {
    const pauses: number[] = []
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: { 1: { statut: 403, corps: { message: "Forbidden" } } },
    })

    const resultat = await lecture(github, {
      attendre: async (pause) => {
        pauses.push(pause)
      },
    })

    expect(raison(resultat)).toContain(REMEDE_PLAN_OU_VISIBILITE)
    expect(github.urls).toHaveLength(2)
    expect(pauses).toEqual([])
  })

  it("déclare illisible après trois tentatives au lieu de conclure à une dérive", async () => {
    const pauses: number[] = []
    const github = fauxGithub({ liste: { statut: 500, corps: null } })

    const resultat = await lecture(github, {
      attendre: async (pause) => {
        pauses.push(pause)
      },
    })

    expect(raison(resultat)).toContain("3 lectures")
    expect(github.urls).toHaveLength(3)
    expect(pauses).toEqual([500, 1500])
  })

  it("réessaie une panne réseau, puis déclare illisible", async () => {
    const pauses: number[] = []
    const github = fauxGithub({
      liste: () => {
        throw new Error("réseau coupé")
      },
    })

    const resultat = await lecture(github, {
      attendre: async (pause) => {
        pauses.push(pause)
      },
    })

    expect(raison(resultat)).toContain("réseau coupé")
    expect(pauses).toEqual([500, 1500])
  })
})

describe("la résolution du dépôt et du jeton", () => {
  it("résout le dépôt par la session `gh` quand `GITHUB_REPOSITORY` manque", async () => {
    const appels: { commande: string; arguments: readonly string[] }[] = []
    const github = fauxGithub({
      liste: ok([resume(1, "main-protection")]),
      details: { 1: ok(ruleset({ id: 1 })) },
    })

    const resultat = await lecture(github, {
      env: environnement({ GH_TOKEN: "jeton-de-test" }),
      executer: (commande, arguments_) => {
        appels.push({ commande, arguments: arguments_ })
        return `${DEPOT}\n`
      },
    })

    expect(resultat.lisible).toBe(true)
    expect(appels).toEqual([
      {
        commande: "gh",
        arguments: [
          "repo",
          "view",
          "--json",
          "nameWithOwner",
          "--jq",
          ".nameWithOwner",
        ],
      },
    ])
    expect(github.urls[0]).toBe(API)
  })

  it("déclare illisible sans jeton, nomme le remède et n'appelle pas le réseau", async () => {
    const github = fauxGithub({ liste: ok([]) })

    const resultat = await lecture(github, {
      env: environnement({ GITHUB_REPOSITORY: DEPOT }),
      executer: () => {
        throw new Error("gh n'est pas connecté")
      },
    })

    expect(raison(resultat)).toContain(REMEDE_DU_JETON)
    expect(github.urls).toEqual([])
  })

  it("ne lit jamais un GITHUB_TOKEN de CI comme jeton d'administration", async () => {
    const github = fauxGithub({ liste: ok([]) })

    const resultat = await lecture(github, {
      env: environnement({
        GITHUB_REPOSITORY: DEPOT,
        GITHUB_TOKEN: "jeton-de-ci",
      }),
      executer: () => {
        throw new Error("gh n'est pas connecté")
      },
    })

    expect(raison(resultat)).toContain(REMEDE_DU_JETON)
    expect(github.urls).toEqual([])
  })

  it("déclare illisible quand aucun dépôt n'est résolu, en nommant le remède", async () => {
    const github = fauxGithub({ liste: ok([]) })

    const resultat = await lecture(github, {
      env: environnement({ GH_TOKEN: "jeton-de-test" }),
      executer: () => {
        throw new Error("gh n'est pas connecté")
      },
    })

    expect(raison(resultat)).toContain(REMEDE_DU_DEPOT)
    expect(github.urls).toEqual([])
  })
})
