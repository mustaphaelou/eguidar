import { readFileSync } from "node:fs"
import path from "node:path"

import { load } from "js-yaml"
import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const FLUX = path.join(RACINE, ".github", "workflows", "ci.yml")
const MANIFESTE = path.join(RACINE, "package.json")

/**
 * Les entrées du manifeste qui ne sont pas des checks, avec la raison de
 * chacune. C'est la seule définition du mot « check » que le dépôt possède : le
 * manifeste sert aussi à lancer à la main des choses qu'aucune vérification
 * automatique ne doit invoquer.
 *
 * C'est une liste écrite à la main, et la spec se méfie de ces listes : mais
 * celle-ci ne répète pas une information que le manifeste ou le flux portent
 * déjà, elle porte une décision que ni l'un ni l'autre ne peut exprimer — est-ce
 * que `build:check` est une vérification, ou la même construction que `build`
 * avec une URL épinglée pour la lancer en local ? Répondre ici, une fois, vaut
 * mieux que le redécouvrir à chaque lecture.
 *
 * Les nommer une à une, plutôt que les déduire d'une forme de nom, évite le
 * piège du suffixe : `format:check` est un check, `build:check` n'en est pas un,
 * et `format` non plus. Le lecteur n'a donc aucune règle à mémoriser, seulement
 * une liste à lire.
 *
 * Le dernier test de la deuxième série vérifie que chacune de ces entrées
 * existe encore dans le manifeste. Sans lui, une entrée retirée laisserait
 * dormir ici un nom périmé, et la garde perdrait son sujet en silence.
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
  // Le job `build` de la CI passe ses variables d'environnement à l'étape et
  // appelle `build` ; celui-ci n'est que la même commande avec l'URL de base
  // épinglée, pour la lancer en local sans passer par le shell.
  [
    "build:check",
    "le `build` de la CI, avec l'URL de base épinglée pour le lancer en local",
  ],
])

/**
 * Les commandes `npm` qui installent au lieu de vérifier. `npm ci` est dans les
 * cinq jobs : le confondre avec un check mettrait « ci » dans l'écart alors
 * qu'il n'y a rien à câbler.
 */
const COMMANDES_NPM_DINSTALLATION = new Set(["ci", "install", "i"])

/**
 * `npm run <nom>`, et la forme implicite `npm <nom>` que le job `test` emploie :
 * `npm test` est un raccourci de `npm run test`, pas un script distinct. Les
 * deux formes se ramènent au même nom, et c'est ce nom que l'on compare au
 * manifeste. `npx` ne passe pas ici : `npx prisma generate` prépare, il ne
 * vérifie rien.
 */
const FORME_NPM = /\bnpm\s+(?:run\s+)?([a-z][\w:.-]*)/g

/** Les noms de check que ces commandes invoquent, sans doublon ni ordre. */
function extraireLesChecks(commandes: readonly string[]): string[] {
  const nommes = commandes.flatMap((commande) =>
    [...commande.matchAll(FORME_NPM)].map((trouve) => trouve[1])
  )
  return [
    ...new Set(nommes.filter((nom) => !COMMANDES_NPM_DINSTALLATION.has(nom))),
  ]
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

/** Les étapes de chaque job du flux, dans l'ordre du fichier. */
function lireLesEtapes(): Map<string, unknown[]> {
  const flux = load(readFileSync(FLUX, "utf8"))
  const jobs = estObjet(flux) ? flux.jobs : null
  if (!estObjet(jobs)) {
    // Un flux que ce test ne sait pas lire doit le dire, jamais passer pour un
    // flux sans check : l'ensemble vide le ferait verdir pour la mauvaise
    // raison, ce qui est précisément le mal qu'il cherche.
    throw new Error(`${FLUX} : clé \`jobs\` absente ou illisible`)
  }

  const etapes = new Map<string, unknown[]>()
  for (const [nom, job] of Object.entries(jobs)) {
    const duJob = estObjet(job) ? job.steps : null
    if (!Array.isArray(duJob)) {
      throw new Error(`${FLUX} : le job \`${nom}\` n'a pas d'étapes`)
    }
    etapes.set(nom, duJob)
  }
  return etapes
}

/** Les étapes qui portent une commande, dans l'ordre du job. */
function commandesRun(etapes: readonly unknown[]): string[] {
  return etapes
    .filter(estObjet)
    .map((etape) => etape.run)
    .filter((run): run is string => typeof run === "string")
}

function lireLesScripts(): Set<string> {
  const manifeste = JSON.parse(readFileSync(MANIFESTE, "utf8"))
  const scripts = estObjet(manifeste) ? manifeste.scripts : null
  if (!estObjet(scripts)) {
    throw new Error(`${MANIFESTE} : clé \`scripts\` absente ou illisible`)
  }
  return new Set(Object.keys(scripts))
}

const ETAPES = lireLesEtapes()

/** Les checks que chaque job exécute, dans l'ordre du flux. */
const PAR_JOB = new Map<string, string[]>(
  [...ETAPES].map(([nom, etapes]) => [
    nom,
    extraireLesChecks(commandesRun(etapes)),
  ])
)
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

    // Le sens de cette assertion est le seul qui compte, et il ne se voit pas
    // à l'œil : un check que personne ne tourne est vert partout, y compris
    // dans la CI. C'est ainsi que `format` a pu dormir des mois dans le
    // manifeste sans que rien dans le dépôt ne le remarque. Le sens inverse
    // existe lui aussi, et c'est le test d'après qui le couvre.
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

  it("nomme une porte par job, comme les quatre jobs déjà en place", () => {
    const aDeuxPortes = [...PAR_JOB].filter(([, checks]) => checks.length > 1)

    // Sans cette porte, un check ajouté à un job existant passe inaperçu : le
    // job rougit bien, mais il ne rougit plus qu'à lui, et le rapport de la CI
    // n'affiche plus le nom de la porte qui a mordu.
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
  it("s'amorce comme lint et n'exécute que la porte de format", () => {
    const format = ETAPES.get("format")
    const lint = ETAPES.get("lint")

    // Seule la dernière ligne doit différer : même `checkout`, même
    // `setup-node` sur `.nvmrc` avec le cache npm, même `npm ci`. Ni le service
    // Postgres du job `test`, ni le cache `.next` du job `build` n'ont de place
    // ici — y ajouter l'un des deux serait la seule façon de casser l'égalité
    // ci-dessus.
    expect(format?.slice(0, -1)).toEqual(lint?.slice(0, -1))
    expect(PAR_JOB.get("format")).toEqual(["format:check"])
  })
})
