import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const DOSSIER = path.join(RACINE, "docs", "adr")
const INDEX = path.join(DOSSIER, "README.md")

const LIEN = /\]\((\d{4}-[^)]+\.md)\)/g

function fichiersAdr(): string[] {
  return readdirSync(DOSSIER)
    .filter((fichier) => fichier.endsWith(".md") && fichier !== "README.md")
    .sort()
}

function liensDeLIndex(): string[] {
  return [...readFileSync(INDEX, "utf8").matchAll(LIEN)].map((lien) => lien[1])
}

function numerosEnDouble(fichiers: string[]): string[] {
  const porteurs = new Map<string, string[]>()

  for (const fichier of fichiers) {
    const numero = fichier.slice(0, 4)

    porteurs.set(numero, [...(porteurs.get(numero) ?? []), fichier])
  }

  return [...porteurs]
    .filter(([, fichiersDuNumero]) => fichiersDuNumero.length > 1)
    .map(
      ([numero, fichiersDuNumero]) =>
        `« ${numero} » numérote ${fichiersDuNumero.length} décisions : ${fichiersDuNumero.join(", ")}. Un numéro ne désigne qu'une décision — deux worktrees ont pris le même numéro libre, et l'ancre ne dit plus laquelle.`
    )
}

describe("l'index des ADR", () => {
  it("lie chaque décision écrite dans le dossier", () => {
    const liens = liensDeLIndex()
    const absentes = fichiersAdr().filter((fichier) => !liens.includes(fichier))

    expect(
      absentes.map(
        (fichier) =>
          `« ${fichier} » n'est lié par aucun index : c'est l'index que les agents lisent avant de travailler dans une zone, et une décision qu'il ne nomme pas ne se retrouve pas.`
      )
    ).toEqual([])
  })

  it("ne lie aucun fichier absent du dossier", () => {
    const casses = liensDeLIndex().filter(
      (lien) => !existsSync(path.join(DOSSIER, lien))
    )

    expect(
      casses.map(
        (lien) =>
          `« ${lien} » est lié par l'index et n'existe pas dans docs/adr/.`
      )
    ).toEqual([])
  })

  it("donne un numéro à une seule décision", () => {
    expect(numerosEnDouble(fichiersAdr())).toEqual([])
  })

  it("tombe quand deux décisions partagent un numéro", () => {
    const memeNumero = [
      "0055-le-retour-l-encaissement-et-le-remboursement-sont-trois-faits-distincts.md",
      "0055-les-sept-voies-d-authentification-ont-une-seule-declaration.md",
    ]

    expect(numerosEnDouble(memeNumero)).toEqual([
      expect.stringContaining("0055"),
    ])
  })
})
