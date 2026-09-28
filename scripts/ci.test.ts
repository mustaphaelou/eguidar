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

/**
 * Les entrées du manifeste qui ne sont pas des checks, avec la raison de
 * chacune. C'est ici, et nulle part ailleurs, que se décide ce qui n'est pas un
 * check : le manifeste sert aussi à lancer à la main des choses qu'aucune
 * vérification automatique ne doit invoquer.
 *
 * Cette liste ne répète rien que le manifeste ou le flux portent déjà ; elle
 * porte une décision que ni l'un ni l'autre ne peut exprimer. Les nommer une à
 * une, plutôt que les déduire d'une forme de nom, évite le piège du suffixe :
 * `format:check` est un check, `build:check` n'en est pas un, `format` non
 * plus. Le dernier test de la deuxième série vérifie que chacune de ces entrées
 * existe encore, sans quoi une entrée retirée laisserait dormir ici un nom
 * périmé.
 */
const ENTREE_NON_CHECK = new Map([
  // Des serveurs : ils ne se terminent jamais. Une CI qui les attendrait
  // expirerait sans rien apprendre.
  ["dev", "le serveur de développement"],
  ["start", "le serveur de production"],
  // La suite du job `test`, sans sa fin.
  ["test:watch", "`test` sans sa fin : les mêmes tests, en boucle"],
  // Le correctif. Il écrit dans l'arbre : une porte qui a déjà réécrit le
  // dépôt n'a plus rien à signaler, elle a déjà agi.
  ["format", "le correctif, qui écrit dans l'arbre"],
  // Le job `build` de la CI est un `npx prisma generate` suivi d'un `build` à
  // qui on passe trois variables d'environnement. Cette entrée n'est que la
  // commande de build, avec la base épinglée dans le manifeste pour éviter le
  // shell. Elle n'est donc pas la porte que la CI fait tourner — et le dire
  // ici est justement l'objet de cette liste.
  [
    "build:check",
    "`build` avec la base épinglée dans le manifeste, sans le `prisma generate` ni les deux autres variables du job `build`",
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

/** Les étapes d'un job du flux, filtrées de ce qui n'en est pas une. */
function etapesDe(nom: string): Record<string, unknown>[] {
  const etapes = lireLesJobs().get(nom)?.steps
  return Array.isArray(etapes) ? etapes.filter(estObjet) : []
}

/**
 * L'étape utilise-t-elle cette action, quelle que soit la version qu'elle porte
 * aujourd'hui ? Le test porte sur l'action, pas sur le numéro qu'elle porte ce
 * jour-ci : épingler ce numéro ici serait une seconde liste à mettre à jour à
 * chaque montée de version, c'est-à-dire une dérive qui ne mords jamais.
 */
function utiliseAction(etape: Record<string, unknown>, nom: string): boolean {
  return typeof etape.uses === "string" && etape.uses.startsWith(`${nom}@`)
}

const JOBS = lireLesJobs()

/** Les checks que chaque job exécute, dans l'ordre du flux. */
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

    // Le sens de cette assertion ne se voit pas à l'œil : un check que personne
    // ne tourne est vert partout, y compris dans la CI. C'est ainsi que
    // `format` a pu dormir des mois dans le manifeste sans que rien ne le
    // remarque. Le sens inverse est couvert par le test d'après.
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

    // Cette assertion défend une décision explicite de la spec — « la CI gagne
    // un cinquième job, pas un cinquième étape » — dont la raison tient en une
    // phrase : un build rouge ne doit pas cacher un test rouge derrière lui. Un
    // deuxième check dans un même job romprait cette isolation, et le rapport de
    // la CI ne nommerait plus la porte qui a mordu. Le prix est connu et
    // assumé : le jour où un job doit vraiment porter deux checks, il faudra
    // rouvrir la décision, pas contourner le test.
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

    // Trois fondations, et trois seulement : la même source de version de Node,
    // le même cache de dépendances, la même installation. C'est ce que la spec
    // demande, et cela se vérifie par les effets qu'on énonce ici, pas par une
    // égalité de liste entière avec le job `lint` : cette égalité-là dirait
    // « identique à `lint` pour toujours », et imposerait au job `format` les
    // étapes qu'on ajoutera plus tard à `lint` — dont un éventuel
    // `npx prisma generate`, dont la sortie générée n'est pas formatée et qui
    // le rendrait rouge à son tour.
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
    // Ni le service Postgres du job `test`, ni le cache `.next` du job `build` :
    // un job de format qui ferait autre chose que du format ne nommerait plus,
    // en cas de rouge, la porte qui a mordu.
    expect(PAR_JOB.get("format")).toEqual(["format:check"])
    expect(JOBS.get("format")?.services).toBeUndefined()
    expect(
      etapesDe("format").some((etape) => utiliseAction(etape, "actions/cache"))
    ).toBe(false)
  })
})
