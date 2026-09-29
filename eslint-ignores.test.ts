import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

import { ESLint, type Linter } from "eslint"
import { describe, expect, it } from "vitest"

const RACINE = import.meta.dirname
const GITIGNORE = path.join(RACINE, ".gitignore")

/** Le nom du fichier planté, assez laid pour qu'aucun motif ne le rejoigne. */
const SONDE = "essai-du-linter.ts"

/**
 * Les trois dossiers que la spec nomme, écrits une fois pour les deux tests qui
 * les comptent. Les écrire deux fois serait la seconde liste maintenue à la
 * main que ce fichier existe pour interdire.
 */
const DOSSIERS_NOMMES = [".scratch", "coverage", "notes"]

/**
 * Un fichier que le linter ne peut pas ne pas signaler : une variable
 * déclarée, affectée et jamais lue viole `@typescript-eslint/no-unused-vars`,
 * que `eslint.config.mjs` fixe lui-même à `error`. La sonde ne tient donc
 * d'aucun réglage du jeu de règles importé, et le test ne peut pas verdir parce
 * que la violation aurait été éteinte ailleurs.
 */
const CONTENU_SONDE = `export const comparer = (entree: string): boolean => {
  const jamaisLu = "présente"
  return entree.length > 0
}
`

/** Les métacaractères d'un motif glob : ce qui le rend autre chose qu'un nom. */
const METACARACTERES = /[*?[\]!]/

/**
 * Les dossiers de premier niveau que `.gitignore` ignore, déduits de son texte
 * et non du disque.
 *
 * Un motif ne candidat que s'il tient en un seul segment de nom, sans
 * métacaractère de glob et sans négation : `*.tsbuildinfo`, `.env*` et
 * `.yarn/*` sont écartés là, et `next-env.d.ts` aussi jusqu'à ce que la carte
 * d'exceptions dise pourquoi.
 *
 * L'ancrage `/` initial ne distingue rien par lui-même — `/coverage` et
 * `coverage` nomment la même chose à la racine. Les deux formes sont donc lues,
 * pour qu'un quatrième dossier soit attrapé quelle que soit la façon dont on
 * l'écrit.
 *
 * La dérivation lit le texte et non l'arbre parce qu'elle doit rendre le même
 * verdict sur un checkout propre, où aucun de ces dossiers n'existe, et sur la
 * machine d'un agent, où `.scratch/` est plein. Un dossier absent ne peut pas
 * être la preuve qu'il est ignoré ; seul son motif l'est.
 */
function nomsAncres(): string[] {
  const motifs = readFileSync(GITIGNORE, "utf8")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(
      (motif) =>
        motif !== "" && !motif.startsWith("#") && !motif.startsWith("!")
    )
    .map((motif) => motif.replace(/^\//, "").replace(/\/$/, ""))
    .filter((nom) => !METACARACTERES.test(nom) && !nom.includes("/"))

  return [...new Set(motifs)].sort()
}

/**
 * Les motifs que la comparaison laisse de côté, avec la raison de chacun.
 *
 * Un motif sans `/` final ne distingue pas un fichier d'un dossier : c'est la
 * règle de git pour tout nom nu, et `.gitignore` ne dit donc pas lequel des deux
 * `/coverage` désigne. La comparaison porte sur ce qu'elle sait nommer, et le
 * reste est écrit ici plutôt que supposé. Un test plus bas échoue si une
 * entrée survit à son motif.
 */
const HORS_COMPARAISON = new Map([
  [
    ".pnp",
    "le magasin virtuel de pnpm. Ce que pnpm écrit a ce nom est `.pnp.cjs`, un fichier, déjà nommé par le motif suivant ; aucun dossier de ce nom n'est créé.",
  ],
  [
    ".DS_Store",
    "le fichier de Finder, que macOS dépose à la racine. Le linter ne l'examinerait pas de lui-même.",
  ],
  [
    "next-env.d.ts",
    "le fichier que Next régénère, un fichier et non un dossier, et que `eslint.config.mjs` écarte déjà pour une autre raison : celle d'`eslint-config-next`.",
  ],
])

/** Les dossiers que `.gitignore` ignore, moins ceux que la comparaison écarte. */
function dossiersIgnores(): string[] {
  return nomsAncres().filter((nom) => !HORS_COMPARAISON.has(nom))
}

/**
 * Les fichiers que git suit. Ils ne sont jamais comparés un par un — ils
 * servent à dériver les dossiers que git connaît, chaque préfixe d'un fichier
 * suivi étant un tel dossier.
 */
function fichiersSuivis(): string[] {
  const enumeration = spawnSync("git", ["ls-files"], {
    cwd: RACINE,
    encoding: "utf8",
    timeout: 60_000,
  })

  if (enumeration.status !== 0) {
    throw new Error(`git ls-files : ${enumeration.stderr ?? "sans diagnostic"}`)
  }

  return (enumeration.stdout ?? "").split("\n").filter(Boolean)
}

/**
 * Les entrées de premier niveau que git ignore, demandées à git lui-même.
 *
 * `check-ignore` ne rend que les chemins qu'il classe dans les ignores, et
 * `--no-index` lui fait répondre comme si le chemin n'était pas suivi — sans
 * lui, un dossier à la fois suivi et ignoré, ce qu'est `.scratch/`,
 * disparaîtrait de la réponse et la comparaison perdrait sa moitié.
 *
 * La liste est NUL séparée parce qu'un nom de premier niveau peut contenir
 * n'importe quoi, espace compris.
 */
function entetesIgnoreesParGit(): Set<string> {
  const interrogation = spawnSync(
    "git",
    ["check-ignore", "--no-index", "-z", "--stdin"],
    {
      cwd: RACINE,
      encoding: "utf8",
      input: `${entetesDePremierNiveau().join("\0")}\0`,
    }
  )

  if (interrogation.status !== 0 && interrogation.status !== 1) {
    throw new Error(
      `git check-ignore : ${interrogation.stderr ?? "sans diagnostic"}`
    )
  }

  return new Set((interrogation.stdout ?? "").split("\0").filter(Boolean))
}

/** Les noms d'entrée de premier niveau que l'index mentionne. */
function entetesDePremierNiveau(): string[] {
  return [...new Set(fichiersSuivis().map((fichier) => fichier.split("/")[0]))]
}

/**
 * Tous les dossiers que git connaît, à toute profondeur, moins ceux qui sont
 * sous une entrée qu'il ignore.
 *
 * Les dossiers viennent des chemins eux-mêmes — chaque préfixe d'un fichier
 * suivi est un dossier que git connaît — et non d'un parcours de l'arbre, qui
 * verrait des dossiers que git ignore et des worktrees entiers.
 *
 * `.git` n'apparaît jamais ici : il ne contient aucun fichier suivi, donc aucun
 * préfixe ne le nomme. C'est ce qui rend inutile une exception pour lui.
 */
function dossiersSuivis(): string[] {
  const prefixes = new Set<string>()
  for (const fichier of fichiersSuivis()) {
    const morceaux = fichier.split("/")
    for (let profondeur = 1; profondeur < morceaux.length; profondeur++) {
      prefixes.add(morceaux.slice(0, profondeur).join("/"))
    }
  }

  const ignores = entetesIgnoreesParGit()
  return [...prefixes]
    .filter((dossier) => !ignores.has(dossier.split("/")[0]))
    .sort()
}

/**
 * `warnIgnored: false` pour qu'un fichier écarté ne remonte pas comme un
 * avertissement : « le linter ne dit rien de ce fichier » doit se lire dans le
 * résultat, pas dans une phrase que l'on doit apprendre à reconnaître.
 */
const LINTER = new ESLint({ cwd: RACINE, warnIgnored: false })

/**
 * Les noms de sondes d'un dossier : un fichier `.ts` et un fichier `.tsx`, les
 * deux extensions qui portent tout le TypeScript de ce dépôt.
 *
 * Deux sondes et non une seule parce qu'un motif d'exclusion qui ne viserait
 * qu'une extension passerait inaperçu d'une seule : `components\/**\/*.tsx`
 * n'attrape pas une sonde `.ts`. Les deux extensions couvrent ici la surface
 * que le linter examine, hors trois fichiers de configuration `.mjs` et `.cjs`
 * posés à la racine — que le témoin de la racine, lui, regarde.
 *
 * Une réserve, franche : une exclusion qui ne viserait qu'une autre extension
 * ne se voit pas ici. Une telle exclusion ne relèverait pas de la correspondance
 * que ce fichier garde, qui est entre ce que git ignore et ce que le linter
 * écarte, mais d'une décision sur ce que le linter examine.
 */
const EXTENSIONS_SONDEES = ["ts", "tsx"]

/** Les chemins que la comparaison inverse interroge dans un dossier. */
function sondesDe(dossier: string): string[] {
  return EXTENSIONS_SONDEES.map((extension) =>
    path.join(RACINE, dossier, `essai-du-linter.${extension}`)
  )
}

/**
 * Plante la sonde dans `dossier` — relatif à la racine, `"."` pour la racine
 * elle-même — la fait passer par le linter, puis rend le dossier exactement
 * comme il l'a trouvé, dossier compris s'il n'existait pas. Un dépôt de travail
 * qui garde la trace d'un test est un dépôt où le test suivant n'est plus
 * mesurable.
 *
 * Une seule sonde est plantée, la première des deux : les deux extensions ne
 * servent qu'à la comparaison inverse, qui n'écrit rien et demande seulement
 * au linter son verdict sur un chemin.
 */
async function sonder(dossier: string): Promise<Linter.LintMessage[]> {
  const chemin = sondesDe(dossier)[0]
  const parent = path.dirname(chemin)
  const existait = existsSync(parent)

  mkdirSync(parent, { recursive: true })
  try {
    writeFileSync(chemin, CONTENU_SONDE)
    const resultats = await LINTER.lintFiles([chemin])
    return resultats.flatMap((resultat) => resultat.messages)
  } finally {
    rmSync(chemin, { force: true })
    if (!existait) {
      rmSync(parent, { force: true, recursive: true })
    }
  }
}

describe("la correspondance entre ce que git ignore et ce que le linter ignore", () => {
  it("dérive des dossiers, pas une liste vide", () => {
    const trouves = dossiersIgnores()

    // Une assertion qui ne comparerait la dérivée qu'à une liste vide verdirait
    // pour la mauvaise raison : le critère vient d'une expression régulière,
    // qu'un jour un seul motif suffit à invalider. Les trois dossiers que la
    // spec nomme servent de garde — sans eux, une dérivation morte ne se voit
    // pas.
    for (const attendu of DOSSIERS_NOMMES) {
      expect(trouves, `« ${attendu} » est ignoré par git.`).toContain(attendu)
    }
  })

  it("exclut du linter chacun des dossiers que `.gitignore` exclut", async () => {
    const rapportes: string[] = []

    for (const dossier of dossiersIgnores()) {
      const echappe = await LINTER.isPathIgnored(
        path.join(RACINE, dossier, SONDE)
      )
      if (!echappe) {
        rapportes.push(
          `« ${dossier}/ » est ignoré par git et ne l'est pas du linter : le premier fichier que quelqu'un y posera rendra ` +
            `« npm run lint » rouge sur la seule machine qui l'a produit, et sur aucune autre.`
        )
      }
    }

    // L'assertion est l'union des deux raisons, pas l'une d'elles : `node_modules`
    // passe parce qu'ESLint l'écarte de lui-même, et les sept autres parce que
    // `globalIgnores` les nomme. Les distinguer demanderait un second linter
    // sans aucune configuration, et le rôle de `node_modules` ici est justement
    // de n'avoir pas besoin d'une ligne.
    expect(rapportes).toEqual([])
  })

  it("n'écarte aucun dossier que git connaît", async () => {
    // Le sens inverse du test précédent : la correction fait taire des
    // répertoires, elle n'a pas le droit de faire taire plus que ce que git
    // fait taire. Un `lib/**` glissé dans `globalIgnores` verdirait la
    // correspondance ci-dessus tout en éteignant le linter sur du code que la
    // CI veut voir.
    //
    // Chaque dossier connu de git est sondé, à toute profondeur, et chaque
    // sonde porte une extension que le linter examine : c'est ainsi qu'un motif
    // trop large se sentirait sur un sous-dossier — `lib/use-cases/**` — comme
    // sur un dossier entier, ou sur un motif de fichiers.
    const eteintes: string[] = []

    for (const dossier of dossiersSuivis()) {
      for (const sonde of sondesDe(dossier)) {
        if (await LINTER.isPathIgnored(sonde)) {
          eteintes.push(path.relative(RACINE, sonde))
        }
      }
    }

    expect(
      eteintes.map(
        (sonde) =>
          `« ${sonde} » est dans un dossier que git connaît et n'ignore pas, et le linter l'écarte pourtant : la correction a éteint plus qu'elle ne devait.`
      )
    ).toEqual([])
  })

  it("ne garde hors comparaison aucun nom que `.gitignore` ne porte plus", () => {
    const perimes = [...HORS_COMPARAISON.keys()].filter(
      (nom) => !nomsAncres().includes(nom)
    )

    // Sans ce test, une exception écrite pour un motif qu'un commit a retiré
    // continuerait de soustraire ce nom à la comparaison : la liste des
    // exceptions croit, la correspondance ne mord plus.
    expect(
      perimes.map(
        (nom) =>
          `« ${nom} » est écarté de la comparaison alors que \`.gitignore\` ne le nomme plus (raison donnée : ${HORS_COMPARAISON.get(nom)}).`
      )
    ).toEqual([])
  })
})

describe("un fichier TypeScript mal formé sous un dossier ignoré n'est pas signalé", () => {
  it("ne dit rien du fichier planté dans chacun des trois", async () => {
    const rapportes: string[] = []

    for (const dossier of DOSSIERS_NOMMES) {
      const messages = await sonder(dossier)
      if (messages.length > 0) {
        rapportes.push(
          `« ${dossier}/${SONDE} » est signalé : ${messages
            .map(
              (message) =>
                `${message.ruleId ?? "erreur de lecture"} — ${message.message}`
            )
            .join(", ")}`
        )
      }
    }

    expect(rapportes).toEqual([])
  })

  it("signale pourtant le même fichier à la racine, où le linter descend", async () => {
    // Le témoin sans lequel le test d'au-dessus ne prouverait rien : une sonde
    // que le linter ne sait pas lire verdirait aussi bien sous un dossier
    // ignoré. Le dépôt n'a qu'une racine, elle n'est pas ignorée, et le linter
    // y descend.
    const messages = await sonder(".")

    expect(messages.map((message) => message.ruleId)).toContain(
      "@typescript-eslint/no-unused-vars"
    )
  })
})
