import { spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const CROCHET = path.join(RACINE, ".githooks", "pre-commit")

const DOSSIER = mkdtempSync(path.join(tmpdir(), "crochet-"))
/** Un dépôt jetable où le crochet est réellementbranché et réellement appelé. */
const REPO = path.join(DOSSIER, "depot")

/**
 * Un fichier délibérément mal formé, le même défaut que
 * `scripts/format.test.ts` plante : des espaces autour du deux-points, une
 * indentation de cinq espaces, aucun point-virgule, aucun saut de ligne final.
 * Chacune de ces violations tient sous la configuration du projet comme sous
 * celle par défaut de Prettier.
 */
const VIOLATION = `export const saluer = ( nom : string ) => {
     return "bonjour, " + nom
}`

function ecrire(chemin: string, valeur: string): void {
  writeFileSync(path.join(REPO, chemin), valeur)
}

/**
 * L'identité git est passée à chaque commande plutôt que posée dans une
 * configuration : ce test n'écrit nulle part ailleurs, et il n'écrit surtout
 * pas dans l'index du dépôt qu'il est en train de éprouver. Elle manque aussi
 * bien à `git()` qu'à `tenterUnCommit()` : un commit refusé pour « qui êtes-vous
 * » passerait pour un crochet qui a mordu.
 */
const IDENTITE = [
  "-c",
  "user.email=essai@exemple",
  "-c",
  "user.name=Essai",
  "-c",
  "commit.gpgsign=false",
]

function git(...lesArguments: string[]): number | null {
  return spawnSync("git", [...IDENTITE, ...lesArguments], {
    cwd: REPO,
    encoding: "utf8",
  }).status
}

/**
 * Le dépôt tel que git le lance : le même fichier, au même endroit, dans le même
 * chemin de crochets. Rien n'est simulé — le crochet est exécuté par git
 * lui-même, ce qui est la seule façon de prouver qu'il est bien branché.
 */
function tenterUnCommit(message: string) {
  const execution = spawnSync(
    "git",
    [...IDENTITE, "commit", "--quiet", "--message", message],
    {
      cwd: REPO,
      encoding: "utf8",
      timeout: 120_000,
    }
  )

  return {
    statut: execution.status,
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
  }
}

/** L'état du dépôt après l'appel, pour distinguer un refus d'un blocage. */
function tete(): string | null {
  return spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO,
    encoding: "utf8",
  }).stdout.trim()
}

beforeAll(() => {
  mkdirSync(path.join(REPO, "scripts"), { recursive: true })
  mkdirSync(path.join(REPO, ".githooks"), { recursive: true })
  mkdirSync(path.join(REPO, "app"), { recursive: true })

  // La porte et sa configuration, prises telles que le dépôt les a : un crochet
  // éprouvé contre une autre porte ne prouverait rien de celle-ci.
  copyFileSync(
    path.join(RACINE, "scripts", "format.ts"),
    path.join(REPO, "scripts", "format.ts")
  )
  copyFileSync(path.join(RACINE, ".prettierrc"), path.join(REPO, ".prettierrc"))
  // `.prettierrc` nomme `app/globals.css` pour le plugin Tailwind : sans ce
  // fichier, le plugin échouerait sur une configuration que le dépôt déclare.
  cpSync(
    path.join(RACINE, "app", "globals.css"),
    path.join(REPO, "app", "globals.css")
  )
  // `tsx` et Prettier se résolvent depuis le dépôt ; un lien suffit et évite de
  // recopier plusieurs centaines de mégaoctets.
  symlinkSync(
    path.join(RACINE, "node_modules"),
    path.join(REPO, "node_modules")
  )

  copyFileSync(CROCHET, path.join(REPO, ".githooks", "pre-commit"))
  chmodSync(path.join(REPO, ".githooks", "pre-commit"), 0o755)

  ecrire("couvert.ts", "export const valeur = 1\n")
  ecrire("ecarte.md", "# titre\n")
  // Le lien vers `node_modules` ne doit pas rejoindre l'index : il n'est ni un
  // fichier du dépôt ni une violation de format, et `git add .` le remonterait.
  ecrire(".gitignore", "node_modules\n")

  if (git("init", "--quiet", ".") !== 0) throw new Error("git init a échoué")
  if (git("add", ".") !== 0) throw new Error("git add a échoué")
  // `core.hooksPath` est posé par `npm run prepare` dans le dépôt réel ; le test
  // le pose ici pour que `git init` n'y touche pas.
  git("config", "core.hooksPath", ".githooks")
  if (tenterUnCommit("départ").statut !== 0) {
    throw new Error("le commit de départ a été refusé")
  }
})

afterAll(() => {
  rmSync(DOSSIER, { force: true, recursive: true })
})

describe("le crochet de commit est branché, et git l'exécute", () => {
  it("refuse un commit dont un fichier indexé viole le format, et la tête ne bouge pas", () => {
    const avant = tete()

    ecrire("couvert.ts", VIOLATION)
    git("add", "couvert.ts")

    const refus = tenterUnCommit("formatage rompu")

    expect(refus.statut).not.toBe(0)
    expect(refus.sortie).toContain("couvert.ts")
    // Le refus est bien le crochet : aucun commit n'a été écrit.
    expect(tete()).toBe(avant)
  })

  it("laisse passer le même commit une fois le fichier mis en forme", () => {
    spawnSync(
      "node",
      ["node_modules/prettier/bin/prettier.cjs", "--write", "couvert.ts"],
      {
        cwd: REPO,
        encoding: "utf8",
      }
    )
    git("add", "couvert.ts")

    const passe = tenterUnCommit("format rétabli")

    expect(passe.sortie).not.toContain("couvert.ts")
    expect(passe.statut).toBe(0)
  })

  it("sort en silence quand l'index ne porte que ce que la porte ne couvre pas", () => {
    ecrire("ecarte.md", "# titre\n\nUn paragraphe.\n")
    git("add", "ecarte.md")

    const passe = tenterUnCommit("du markdown seul")

    expect(passe.statut).toBe(0)
    // Le silence est le contrat : un commit de Markdown ne doit pas bavarder
    // sur une porte qu'il n'a pas à franchir.
    expect(passe.sortie).toBe("")
  })
})

describe("le branchement du crochet ne dépend pas d'un souvenir", () => {
  it("`npm run prepare` fait pointer git sur le répertoire des crochets", () => {
    const { scripts } = JSON.parse(
      readFileSync(path.join(RACINE, "package.json"), "utf8")
    ) as { scripts: Record<string, string> }

    // Sans cette ligne, le crochet se pose à l'installation sur la seule machine
    // de celui qui l'a écrit : un clone neuf n'en aurait pas, et le dépôt
    // semblerait protégé alors qu'il ne l'est plus.
    expect(scripts["prepare"]).toContain("core.hooksPath")
    expect(scripts["prepare"]).toContain(".githooks")
  })

  it("le crochet est versionné, donc présent dans chaque clone", () => {
    const suivi = spawnSync(
      "git",
      ["ls-files", "--error-unmatch", ".githooks/pre-commit"],
      {
        cwd: RACINE,
        encoding: "utf8",
      }
    )

    // Un crochet écrit dans `.git/hooks/` ne serait pas suivi et disparaîtrait
    // au premier clone : c'est tout ce qui le sépare d'une plomberie locale.
    expect(suivi.status).toBe(0)
  })

  it("le dépôt ne tient qu'un crochet, et c'est celui-là", () => {
    const crochets = spawnSync("git", ["ls-files"], {
      cwd: RACINE,
      encoding: "utf8",
    })
      .stdout.trim()
      .split("\n")
      .filter((chemin) => chemin.endsWith("pre-commit"))

    // Deux crochets versionnés, ce sont deux vérités : `prepare` n'en branche
    // qu'un, et l'autre reste un fichier que git n'exécute jamais — ou, pire,
    // celui que le README recommande. La garde nomme l'unique attendu, donc
    // l'ancien `hooks/pre-commit` la fait rougir s'il revient.
    expect(crochets).toEqual([".githooks/pre-commit"])
  })

  it("le README branche le même crochet que `prepare`", () => {
    const readme = readFileSync(path.join(RACINE, "README.md"), "utf8")

    expect(readme).toContain("core.hooksPath .githooks")
    // L'ancien chemin, encore écrit noir sur blanc, aurait branché un dossier
    // que `prepare` ne pose pas : le README aurait décrit un crochet mort.
    expect(readme).not.toContain("core.hooksPath hooks")
  })
})
