import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")

const ENTREES_ATTENDUES = [".scratch", ".worktrees", ".agents", "notes"]

function entrees(): string[] {
  return readFileSync(path.join(RACINE, ".dockerignore"), "utf8")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"))
    .map((ligne) => ligne.replace(/^\/+/, "").replace(/\/+$/, ""))
}

describe("le contexte de build Docker", () => {
  it("écarte chaque dossier de worktrees et d’artefacts d’agents", () => {
    const ecrites = entrees()

    const absentes = ENTREES_ATTENDUES.filter(
      (entree) => !ecrites.includes(entree)
    )

    expect(
      absentes.map(
        (entree) =>
          `« ${entree} » manque à \`.dockerignore\` : un worktree posé là, avec son node_modules, fuit dans le contexte de build Docker.`
      )
    ).toEqual([])
  })
})
