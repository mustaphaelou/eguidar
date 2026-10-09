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
const REPO = path.join(DOSSIER, "depot")

const VIOLATION = `export const saluer = ( nom : string ) => {
     return "bonjour, " + nom
}`

function ecrire(chemin: string, valeur: string): void {
  writeFileSync(path.join(REPO, chemin), valeur)
}

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

  copyFileSync(
    path.join(RACINE, "scripts", "format.ts"),
    path.join(REPO, "scripts", "format.ts")
  )
  copyFileSync(path.join(RACINE, ".prettierrc"), path.join(REPO, ".prettierrc"))
  cpSync(
    path.join(RACINE, "app", "globals.css"),
    path.join(REPO, "app", "globals.css")
  )
  symlinkSync(
    path.join(RACINE, "node_modules"),
    path.join(REPO, "node_modules")
  )

  copyFileSync(CROCHET, path.join(REPO, ".githooks", "pre-commit"))
  chmodSync(path.join(REPO, ".githooks", "pre-commit"), 0o755)

  ecrire("couvert.ts", "export const valeur = 1\n")
  ecrire("ecarte.md", "# titre\n")
  ecrire(".gitignore", "node_modules\n")

  if (git("init", "--quiet", ".") !== 0) throw new Error("git init a échoué")
  if (git("add", ".") !== 0) throw new Error("git add a échoué")
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
    expect(passe.sortie).toBe("")
  })
})

describe("le branchement du crochet ne dépend pas d'un souvenir", () => {
  it("`npm run prepare` fait pointer git sur le répertoire des crochets", () => {
    const { scripts } = JSON.parse(
      readFileSync(path.join(RACINE, "package.json"), "utf8")
    ) as { scripts: Record<string, string> }

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

    expect(crochets).toEqual([".githooks/pre-commit"])
  })

  it("le README branche le même crochet que `prepare`", () => {
    const readme = readFileSync(path.join(RACINE, "README.md"), "utf8")

    expect(readme).toContain("core.hooksPath .githooks")
    expect(readme).not.toContain("core.hooksPath hooks")
  })
})
