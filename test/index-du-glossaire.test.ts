import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const GLOSSAIRE = path.join(RACINE, "GLOSSARY.md")

const TITRE_INDEX = "## Index"
const ENTREE = /^\*\*(.+)\*\*:$/
const LIGNE_INDEX = /^- \*\*(.+)\*\*$/

function lignesDuGlossaire(): string[] {
  return readFileSync(GLOSSAIRE, "utf8").split("\n")
}

function termesDesEntrees(lignes: readonly string[]): string[] {
  return lignes.flatMap((ligne) => {
    const trouve = ENTREE.exec(ligne)
    return trouve === null ? [] : [trouve[1]!]
  })
}

function positionDeIndex(lignes: readonly string[]): number {
  return lignes.indexOf(TITRE_INDEX)
}

function positionDeLaPremiereEntree(lignes: readonly string[]): number {
  return lignes.findIndex((ligne) => ENTREE.test(ligne))
}

function termesDeIndex(lignes: readonly string[]): string[] {
  const debut = positionDeIndex(lignes)
  const fin = positionDeLaPremiereEntree(lignes)

  if (debut < 0 || fin < debut) {
    throw new Error("l'index ne précède pas la première entrée du glossaire")
  }

  return lignes
    .slice(debut + 1, fin)
    .filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"))
    .map((ligne) => {
      const trouve = LIGNE_INDEX.exec(ligne)
      if (trouve === null) {
        throw new Error(`ligne d'index illisible : « ${ligne} »`)
      }
      return trouve[1]!
    })
}

function echappe(terme: string): string {
  return terme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function nombresEntreesTrouvees(
  termes: readonly string[],
  lignes: readonly string[]
): number[] {
  const entrees = lignes.filter((ligne) => ENTREE.test(ligne))

  return termes.map((terme) => {
    const motif = new RegExp(`^\\*\\*${echappe(terme)}\\*\\*:$`)

    return entrees.filter((entree) => motif.test(entree)).length
  })
}

function entreesAbsentes(
  termes: readonly string[],
  lignes: readonly string[]
): string[] {
  const entrees = termesDesEntrees(lignes)

  return termes
    .filter((terme) => !entrees.includes(terme))
    .map(
      (terme) =>
        `« ${terme} » figure dans l'index et n'a aucune entrée : la ligne mène à une définition absente.`
    )
}

describe("l'index du glossaire", () => {
  const lignes = lignesDuGlossaire()

  it("précède la première entrée", () => {
    expect(positionDeIndex(lignes)).toBeGreaterThan(-1)
    expect(positionDeIndex(lignes)).toBeLessThan(
      positionDeLaPremiereEntree(lignes)
    )
  })

  it("porte chaque entrée une fois, dans l'ordre du fichier", () => {
    expect(termesDeIndex(lignes)).toEqual(termesDesEntrees(lignes))
  })

  it("ne nomme aucune entrée absente", () => {
    expect(entreesAbsentes(termesDeIndex(lignes), lignes)).toEqual([])
  })

  it("nomme chaque entrée sans doublon", () => {
    const termes = termesDeIndex(lignes)

    expect(new Set(termes).size).toBe(termes.length)
    expect(
      termesDesEntrees(lignes).filter((terme) => !termes.includes(terme))
    ).toEqual([])
  })

  it("mène chaque ligne à l'entrée que le grep trouve", () => {
    expect(
      nombresEntreesTrouvees(termesDeIndex(lignes), lignes).filter(
        (nombre) => nombre !== 1
      )
    ).toEqual([])
  })

  it("tombe quand une ligne nomme une entrée absente", () => {
    const lignesSynthetiques = ["**Panier**:", "**Commande**:"]

    expect(
      entreesAbsentes(["Pied de page", "Commande"], lignesSynthetiques)
    ).toEqual([expect.stringContaining("Pied de page")])
  })
})
