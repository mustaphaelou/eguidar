import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "worktree.sh")

function lancer(...arguments_: string[]) {
  return spawnSync("bash", [SCRIPT, ...arguments_], {
    cwd: RACINE,
    encoding: "utf8",
  })
}

function git(cwd: string, ...arguments_: string[]) {
  const resultat = spawnSync("git", arguments_, { cwd, encoding: "utf8" })
  if (resultat.status !== 0) {
    throw new Error(`git ${arguments_.join(" ")} : ${resultat.stderr}`)
  }
}

function depotAvecWorktreeFusionne(): { temp: string; cible: string } {
  const temp = mkdtempSync(path.join(tmpdir(), "eguidar-prune-"))
  const cible = path.join(temp, ".worktrees", "fusionnee")

  git(temp, "init", "-b", "main")
  git(temp, "config", "user.email", "agent@example.test")
  git(temp, "config", "user.name", "agent")
  writeFileSync(path.join(temp, "fichier.txt"), "un\n")
  git(temp, "add", "fichier.txt")
  git(temp, "commit", "-m", "un")
  git(temp, "checkout", "-b", "fusionnee")
  writeFileSync(path.join(temp, "fichier.txt"), "deux\n")
  git(temp, "commit", "-am", "deux")
  git(temp, "checkout", "main")
  git(temp, "merge", "--no-ff", "fusionnee", "-m", "fusion")
  git(temp, "update-ref", "refs/remotes/origin/main", "HEAD")
  mkdirSync(path.join(temp, ".worktrees"), { recursive: true })
  git(temp, "worktree", "add", cible, "fusionnee")

  return { temp, cible }
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

  it("annonce un worktree fusionné sans le retirer en mode brouillon", () => {
    const { temp, cible } = depotAvecWorktreeFusionne()

    try {
      const { status, stdout } = spawnSync(
        "bash",
        [SCRIPT, "--prune", "--dry-run"],
        { cwd: temp, encoding: "utf8" }
      )

      expect(status).toBe(0)
      expect(stdout).toContain("aurait été retiré")
      expect(stdout).toContain(cible)
      expect(existsSync(cible)).toBe(true)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it("accepte le mode brouillon avant --prune", () => {
    const { temp, cible } = depotAvecWorktreeFusionne()

    try {
      const { status, stdout } = spawnSync(
        "bash",
        [SCRIPT, "--dry-run", "--prune"],
        { cwd: temp, encoding: "utf8" }
      )

      expect(status).toBe(0)
      expect(stdout).toContain("aurait été retiré")
      expect(existsSync(cible)).toBe(true)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it("retire un worktree fusionné et laisse sa branche", () => {
    const { temp, cible } = depotAvecWorktreeFusionne()

    try {
      const { status, stdout } = spawnSync("bash", [SCRIPT, "--prune"], {
        cwd: temp,
        encoding: "utf8",
      })

      expect(status).toBe(0)
      expect(stdout).toContain("retiré")
      expect(existsSync(cible)).toBe(false)
      expect(
        spawnSync("git", ["rev-parse", "--verify", "fusionnee"], { cwd: temp })
          .status
      ).toBe(0)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it("laisse un worktree fusionné qui porte des modifications locales", () => {
    const { temp, cible } = depotAvecWorktreeFusionne()

    try {
      writeFileSync(path.join(cible, "fichier.txt"), "local\n")

      const { status, stdout } = spawnSync("bash", [SCRIPT, "--prune"], {
        cwd: temp,
        encoding: "utf8",
      })

      expect(status).toBe(0)
      expect(stdout).toContain("modifications locales")
      expect(existsSync(cible)).toBe(true)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })
})
