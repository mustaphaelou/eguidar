import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Le helper ne crée pas de checkout dans la suite : `--dry-run` annonce ce
 * qu'il ferait, et c'est ce contrat que la convention de `worktrees.md` vend.
 */

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "worktree.sh")

function lancer(...arguments_: string[]) {
  return spawnSync("bash", [SCRIPT, ...arguments_], {
    cwd: RACINE,
    encoding: "utf8",
  })
}

describe("scripts/worktree.sh", () => {
  it("annonce le chemin et la base de test sans rien créer", () => {
    const cible = path.join(RACINE, ".worktrees", "spec-999-essai")

    const { status, stdout } = lancer("--dry-run", "spec/999-essai")

    expect(status, "le mode brouillon doit réussir").toBe(0)
    expect(stdout).toContain(cible)
    expect(stdout).toContain("eguidar_test_spec_999_essai")
    expect(existsSync(cible), "aucun checkout ne doit apparaître").toBe(false)
  })

  it("refuse de deviner quand la branche manque", () => {
    expect(lancer().status).toBe(1)
    expect(lancer("--dry-run").status).toBe(1)
  })

  it("liste les worktrees enregistrés", () => {
    const { status, stdout } = lancer("--list")

    expect(status).toBe(0)
    expect(stdout).toContain(RACINE)
  })
})
