import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "format.ts")
const CONFIG = path.join(RACINE, ".prettierrc")

const LANCEUR = createRequire(import.meta.url).resolve("tsx/cli")

const DOSSIER = mkdtempSync(path.join(tmpdir(), "format-"))
const FICHIER = path.join(DOSSIER, "salutation.ts")
const REPO = path.join(DOSSIER, "index")
const HORS_DEPO = path.join(DOSSIER, "pas-un-depot")

const VIOLATION = `export const saluer = ( nom : string ) => {
     return "bonjour, " + nom
}`

function planterLaViolation(): void {
  writeFileSync(FICHIER, VIOLATION)
}

function lancer(
  lesArguments: string[],
  dossier: string = RACINE
): {
  sortie: string
  statut: number | null
} {
  const execution = spawnSync(
    process.execPath,
    [LANCEUR, SCRIPT, ...lesArguments],
    {
      cwd: dossier,
      encoding: "utf8",
      timeout: 60_000,
    }
  )

  return {
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
    statut: execution.status,
  }
}

const lire = () => lancer(["--config", CONFIG, FICHIER])
const corriger = () => lancer(["--ecrire", "--config", CONFIG, FICHIER])

function git(...lesArguments: string[]): void {
  const execution = spawnSync(
    "git",
    [
      "-c",
      "user.email=essai@exemple",
      "-c",
      "user.name=Essai",
      ...lesArguments,
    ],
    { cwd: REPO, encoding: "utf8" }
  )
  if (execution.status !== 0) {
    throw new Error(
      `git ${lesArguments.join(" ")} : ${execution.stderr ?? "sans diagnostic"}`
    )
  }
}

function ecrire(chemin: string, valeur = 1): void {
  writeFileSync(path.join(REPO, chemin), `export const valeur = ${valeur}\n`)
}

function preparerLeDepot(): void {
  mkdirSync(path.join(REPO, "compose"), { recursive: true })
  mkdirSync(HORS_DEPO)
  ecrire("couvert.ts")
  ecrire("compose/imbrique.tsx")
  ecrire("ecarte.md")
  ecrire("espace accentué.ts")
  ecrire("supprime.ts")

  git("init", "--quiet", ".")
  git("add", ".")
  git("commit", "--quiet", "--message", "départ")

  ecrire("couvert.ts", 2)
  ecrire("compose/imbrique.tsx", 2)
  ecrire("ecarte.md", 2)
  ecrire("espace accentué.ts", 2)
  rmSync(path.join(REPO, "supprime.ts"))
  git("add", "--all", ".")
}

beforeAll(() => {
  preparerLeDepot()
})

afterAll(() => {
  rmSync(DOSSIER, { force: true, recursive: true })
})

describe("scripts/format.ts — la porte mord, et le correctif la fait taire", () => {
  it("sort en erreur en nommant le fichier, puis sort en zéro après le correctif", () => {
    planterLaViolation()

    const avant = lire()

    expect(avant.statut).not.toBe(0)
    expect(avant.sortie).toContain("salutation.ts")

    const correction = corriger()
    const apres = lire()

    expect(correction.statut).toBe(0)
    expect(readFileSync(FICHIER, "utf8")).not.toBe(VIOLATION)

    expect(apres.statut).toBe(0)
    expect(apres.sortie).not.toContain("salutation.ts")
  })
})

describe("l'énumération que le crochet consume", () => {
  it("nomme les fichiers indexés du jeu, et aucun autre", () => {
    const enumeration = lancer(["--indexes"], REPO)

    expect(enumeration.statut).toBe(0)
    expect(enumeration.sortie.trim().split("\n").sort()).toEqual([
      "compose/imbrique.tsx",
      "couvert.ts",
      "espace accentué.ts",
    ])
  })

  it("ne nomme plus rien dès que l'index n'a plus rien à dire", () => {
    git("commit", "--quiet", "--message", "tout est indexé")

    const enumeration = lancer(["--indexes"], REPO)

    expect(enumeration.statut).toBe(0)
    expect(enumeration.sortie.trim()).toBe("")
  })

  it("sort en erreur en nommant la cause quand l'index ne se lit pas", () => {
    const horsDepot = lancer(["--indexes"], HORS_DEPO)

    expect(horsDepot.statut).not.toBe(0)
    expect(horsDepot.sortie).toContain("lecture de l'index impossible")
  })
})

describe("la déclaration de la porte", () => {
  it("déclare la porte et le correctif comme deux appels au même script", () => {
    const { scripts } = JSON.parse(
      readFileSync(path.join(RACINE, "package.json"), "utf8")
    ) as { scripts: Record<string, string> }

    expect(scripts["format"]).toContain("scripts/format.ts")
    expect(scripts["format:check"]).toContain("scripts/format.ts")

    expect(scripts["format"]).not.toContain("*")
    expect(scripts["format:check"]).not.toContain("*")
  })

  it("exclut les worktrees imbriqués dans sa propre configuration d'ignore", () => {
    const ignores = readFileSync(path.join(RACINE, ".prettierignore"), "utf8")

    expect(ignores).toMatch(/^\.worktrees\/$/m)
  })
})
