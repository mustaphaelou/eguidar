import { readFileSync } from "node:fs"
import path from "node:path"

import { load } from "js-yaml"
import { describe, expect, it } from "vitest"

const FICHIER = path.join(import.meta.dirname, ".github", "dependabot.yml")

type MiseAJour = {
  "package-ecosystem": string
  directory: string
  schedule: { interval: string }
  groups?: Record<string, { patterns: string[] }>
}

const FICHIER_LU = load(readFileSync(FICHIER, "utf8")) as {
  version?: unknown
  updates?: unknown
}

function misesAJour(): MiseAJour[] {
  return FICHIER_LU.updates as MiseAJour[]
}

describe("Dependabot surveille les écosystèmes du dépôt", () => {
  it("reste un fichier Dependabot v2 lisible", () => {
    expect(FICHIER_LU.version).toBe(2)
    expect(Array.isArray(FICHIER_LU.updates)).toBe(true)
  })

  it("déclare github-actions, npm et docker à la racine", () => {
    const suivis = misesAJour()
      .map((miseAJour) => [miseAJour["package-ecosystem"], miseAJour.directory])
      .sort(([a], [b]) => a.localeCompare(b))

    expect(suivis).toEqual([
      ["docker", "/"],
      ["github-actions", "/"],
      ["npm", "/"],
    ])
  })

  it("garde une planification hebdomadaire", () => {
    expect([
      ...new Set(misesAJour().map((miseAJour) => miseAJour.schedule.interval)),
    ]).toEqual(["weekly"])
  })

  it("groupe chaque écosystème en une seule pull request par passage", () => {
    for (const miseAJour of misesAJour()) {
      const groupes = Object.values(miseAJour.groups ?? {})

      expect(groupes).toHaveLength(1)
      expect(groupes[0]?.patterns).toEqual(["*"])
    }
  })
})
