import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  checksParJob,
  estObjet,
  extraireLesChecks,
  lireLesJobs,
} from "./ci-liste"

const RACINE = path.resolve(import.meta.dirname, "..")
const MANIFESTE = path.join(RACINE, "package.json")

const ENTREE_NON_CHECK = new Map([
  ["dev", "le serveur de développement"],
  ["start", "le serveur de production"],
  ["test:watch", "`test` sans sa fin : les mêmes tests, en boucle"],
  [
    "porte:verifier",
    "le docteur local, qui lit le ruleset vivant : la CI ne peut ni ne doit lire le ruleset, donc aucun job ne l'exécute",
  ],
  ["format", "le correctif, qui écrit dans l'arbre"],
  [
    "prepare",
    "le branchement du crochet, qui écrit dans la configuration locale de git et se lance à l'installation",
  ],
])

function lireLesScripts(): Set<string> {
  const manifeste = JSON.parse(readFileSync(MANIFESTE, "utf8"))
  const scripts = estObjet(manifeste) ? manifeste.scripts : null
  if (!estObjet(scripts)) {
    throw new Error(`${MANIFESTE} : clé \`scripts\` absente ou illisible`)
  }
  return new Set(Object.keys(scripts))
}

function etapesDe(nom: string): Record<string, unknown>[] {
  const etapes = lireLesJobs().get(nom)?.steps
  return Array.isArray(etapes) ? etapes.filter(estObjet) : []
}

function utiliseAction(etape: Record<string, unknown>, nom: string): boolean {
  return typeof etape.uses === "string" && etape.uses.startsWith(`${nom}@`)
}

const JOBS = lireLesJobs()

const PAR_JOB = checksParJob()
const CHECKS_CI = new Set([...PAR_JOB.values()].flat())
const SCRIPTS = lireLesScripts()
const CHECKS_DECLARES = new Set(
  [...SCRIPTS].filter((nom) => !ENTREE_NON_CHECK.has(nom))
)

describe("extraction des checks que le flux invoque", () => {
  it("ramène les deux formes de npm au même nom, et laisse l'installation dehors", () => {
    expect(
      extraireLesChecks([
        "npm ci",
        "npm run lint",
        "npm test",
        "npm run format:check",
        "npx prisma generate",
      ])
    ).toEqual(["lint", "test", "format:check"])
  })
})

describe("la CI et le manifeste exécutent le même ensemble de checks", () => {
  it("ne laisse aucun check du manifeste sans job qui l'exécute", () => {
    const orphelins = [...CHECKS_DECLARES].filter((nom) => !CHECKS_CI.has(nom))

    expect(
      orphelins.map(
        (nom) =>
          `« ${nom} » est déclaré dans le manifeste et aucun job de la CI ne l'exécute : un check que personne ne tourne passe au vert partout.`
      )
    ).toEqual([])
  })

  it("ne laisse aucun check exécuté que le manifeste ne déclare comme check", () => {
    const etrangers = [...CHECKS_CI].filter((nom) => !CHECKS_DECLARES.has(nom))

    expect(
      etrangers.map(
        (nom) =>
          `« ${nom} » est exécuté par un job de la CI sans être déclaré comme check : soit le script a disparu du manifeste, soit la commande n'en est pas un.`
      )
    ).toEqual([])
  })

  it("nomme une porte par job, comme la décision de la spec l'exige", () => {
    const aDeuxPortes = [...PAR_JOB].filter(([, checks]) => checks.length > 1)

    expect(
      aDeuxPortes.map(
        ([nom, checks]) =>
          `le job « ${nom} » exécute ${checks.length} checks (${checks.join(", ")}) alors qu'un job n'en porte qu'un.`
      )
    ).toEqual([])
  })

  it("ne garde aucune entrée classée comme non-check que le manifeste ne porte plus", () => {
    const perimes = [...ENTREE_NON_CHECK].filter(([nom]) => !SCRIPTS.has(nom))

    expect(
      perimes.map(
        ([nom, raison]) =>
          `« ${nom} » est classé comme n'étant pas un check (${raison}) mais le manifeste ne le déclare plus.`
      )
    ).toEqual([])
  })
})

describe("le job de format", () => {
  it("s'amorce sur les mêmes fondations que les autres jobs de vérification", () => {
    const etapes = etapesDe("format")
    const etapeSetupNode = etapes.find((etape) =>
      utiliseAction(etape, "actions/setup-node")
    )

    expect(
      etapes.some((etape) => utiliseAction(etape, "actions/checkout"))
    ).toBe(true)
    expect(etapeSetupNode?.with).toMatchObject({
      "node-version-file": ".nvmrc",
      cache: "npm",
    })
    expect(etapes.map((etape) => etape.run)).toContain("npm ci")
  })

  it("n'exécute que la porte de format, et rien du reste de la CI", () => {
    expect(PAR_JOB.get("format")).toEqual(["format:check"])
    expect(JOBS.get("format")?.services).toBeUndefined()
    expect(
      etapesDe("format").some((etape) => utiliseAction(etape, "actions/cache"))
    ).toBe(false)
  })
})

const COMMANDE_SONDE = "bash scripts/verifier-image-deploiement.sh"

const CONDITION_BROUILLON =
  "github.event_name == 'push' || github.event.pull_request.draft == false"

function etapeSonde(): Record<string, unknown> | undefined {
  return etapesDe("build").find((etape) => etape.run === COMMANDE_SONDE)
}

describe("le job de build éprouve l'artefact de déploiement", () => {
  it("invoque la sonde directement, sans passer par npm", () => {
    expect(
      etapeSonde(),
      `le job « build » n'invoque pas \`${COMMANDE_SONDE}\` : l'image que Coolify déploie ne serait plus éprouvée avant la fusion, et une cible cassée n'apparaîtrait qu'au déploiement.`
    ).toBeDefined()
  })

  it("réserve la sonde aux pushes et aux pull requests non brouillons", () => {
    expect(
      etapeSonde()?.if,
      `l'étape de sonde ne porte pas \`${CONDITION_BROUILLON}\` : un brouillon paierait la construction des deux images, ou les pushes sur \`main\` cesseraient d'être éprouvés.`
    ).toBe(CONDITION_BROUILLON)
  })

  it("borne le job, pour qu'un Docker bloqué ne retienne pas le runner", () => {
    expect(
      JOBS.get("build")?.["timeout-minutes"],
      "le job « build » ne porte pas de `timeout-minutes` : une couche Docker bloquée peut retenir le runner sans fin."
    ).toBe(20)
  })
})
