import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "format.ts")
const CONFIG = path.join(RACINE, ".prettierrc")

/** Le lanceur que le manifeste déclare, résolu sans dépendre du `PATH`. */
const LANCEUR = createRequire(import.meta.url).resolve("tsx/cli")

const DOSSIER = mkdtempSync(path.join(tmpdir(), "format-"))
const FICHIER = path.join(DOSSIER, "salutation.ts")

/**
 * Un fichier délibérément mal formé : espaces autour du deux-points, cinq
 * espaces d'indentation, aucun point-virgule, pas de saut de ligne final.
 * Chacune de ces violations tient sous la configuration du projet comme sous
 * celle par défaut de Prettier, donc le test ne tient pas d'un réglage
 * particulier de l'une ou de l'autre.
 */
const VIOLATION = `export const saluer = ( nom : string ) => {
     return "bonjour, " + nom
}`

function planterLaViolation(): void {
  writeFileSync(FICHIER, VIOLATION)
}

function lancer(lesArguments: string[]): {
  sortie: string
  statut: number | null
} {
  const execution = spawnSync(
    process.execPath,
    [LANCEUR, SCRIPT, ...lesArguments],
    {
      cwd: RACINE,
      encoding: "utf8",
      timeout: 60_000,
    }
  )

  return {
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
    statut: execution.status,
  }
}

/**
 * La porte et le correctif, pointés sur le fichier planté. `--config` est
 * explicite parce que le dossier temporaire est hors du dépôt : sans lui,
 * Prettier n'y trouverait aucune configuration et jugerait le fichier selon ses
 * valeurs par défaut, pas selon celles du projet.
 */
const lire = () => lancer(["--config", CONFIG, FICHIER])
const corriger = () => lancer(["--ecrire", "--config", CONFIG, FICHIER])

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

    // C'est cet aller-retour qui prouve que les deux scripts partagent le même
    // jeu de fichiers. Une dérive entre le correctif et la porte laisserait la
    // porte rouge ici ; rien d'autre dans le dépôt ne le remarquerait.
    expect(apres.statut).toBe(0)
    expect(apres.sortie).not.toContain("salutation.ts")
  })
})

describe("la déclaration de la porte", () => {
  it("déclare la porte et le correctif comme deux appels au même script", () => {
    const { scripts } = JSON.parse(
      readFileSync(path.join(RACINE, "package.json"), "utf8")
    ) as { scripts: Record<string, string> }

    expect(scripts["format"]).toContain("scripts/format.ts")
    expect(scripts["format:check"]).toContain("scripts/format.ts")

    // Un glob recopié dans le manifeste serait exactement la dérive que le test
    // précédent ne voit pas : ni l'un ni l'autre n'en porte.
    expect(scripts["format"]).not.toContain("*")
    expect(scripts["format:check"]).not.toContain("*")
  })

  it("exclut les worktrees imbriqués dans sa propre configuration d'ignore", () => {
    const ignores = readFileSync(path.join(RACINE, ".prettierignore"), "utf8")

    // Sans cette ligne, l'exclusion ne tient plus que par le fait que Prettier
    // lit `.gitignore` par défaut — le même pari que `vitest.config.ts` et
    // `eslint.config.mjs` ont cessé de prendre pour argent comptant.
    expect(ignores).toMatch(/^\.worktrees\/$/m)
  })
})
