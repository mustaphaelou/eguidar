import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const DOSSIER = path.join(RACINE, "docs", "specs")
const INDEX = path.join(DOSSIER, "README.md")

const LIEN = /\]\(([^)\s]+\.md)\)/g

function fichiersSpecs(): string[] {
  return readdirSync(DOSSIER)
    .filter((fichier) => fichier.endsWith(".md") && fichier !== "README.md")
    .sort()
}

function liensDeLIndex(): string[] {
  return [...readFileSync(INDEX, "utf8").matchAll(LIEN)].map((lien) => lien[1]!)
}

function specsNonLiees(fichiers: string[], liens: string[]): string[] {
  return fichiers
    .filter((fichier) => !liens.includes(fichier))
    .map(
      (fichier) =>
        `« ${fichier} » n'est lié par aucun index : une spec qu'aucun index ne nomme ne se retrouve pas, et la session qui l'a produite se perd avec elle.`
    )
}

function liensCasses(
  liens: string[],
  existe: (fichier: string) => boolean
): string[] {
  return liens
    .filter((lien) => !existe(lien))
    .map(
      (lien) =>
        `« ${lien} » est lié par docs/specs/README.md et n'existe pas dans docs/specs/.`
    )
}

describe("l'index des specs", () => {
  it("lie chaque spec écrite dans le dossier", () => {
    expect(specsNonLiees(fichiersSpecs(), liensDeLIndex())).toEqual([])
  })

  it("ne lie aucune spec absente du dossier", () => {
    expect(
      liensCasses(liensDeLIndex(), (lien) =>
        existsSync(path.join(DOSSIER, lien))
      )
    ).toEqual([])
  })

  it("tombe quand une spec n'est pas indexée", () => {
    expect(specsNonLiees(["a.md", "b.md"], ["a.md"])).toEqual([
      expect.stringContaining("b.md"),
    ])
  })

  it("tombe quand l'index lie une spec absente", () => {
    expect(liensCasses(["a.md", "b.md"], (lien) => lien === "a.md")).toEqual([
      expect.stringContaining("b.md"),
    ])
  })
})
