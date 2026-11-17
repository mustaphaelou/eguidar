import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const CARTE = path.join(RACINE, "docs", "CARTE.md")

const LIEN = /\]\(([^)\s]+)\)/g
const LIEN_UNIQUE = /\]\(([^)\s]+)\)/

function cibles(contenu: string): string[] {
  return [...contenu.matchAll(LIEN)]
    .map((correspondance) => correspondance[1]!)
    .filter((cible) => !cible.startsWith("#") && !cible.startsWith("http"))
}

function lignesDeDonnees(contenu: string): string[] {
  return contenu
    .split("\n")
    .filter((ligne) => ligne.startsWith("|"))
    .filter((ligne) => !/^\|\s*English\s*\|/.test(ligne))
    .filter((ligne) => !ligne.startsWith("| ---"))
}

function cheminsAbsents(
  contenu: string,
  existe: (chemin: string) => boolean
): string[] {
  const dossier = path.dirname(CARTE)

  return cibles(contenu)
    .filter((cible) => !existe(path.resolve(dossier, cible)))
    .map(
      (cible) =>
        `« ${cible} » est lié par docs/CARTE.md et n'existe pas : la carte est le premier endroit où un agent cherche un mot, et un chemin mort l'envoie lire un module qui n'est plus là.`
    )
}

describe("la carte des termes", () => {
  it("lie chaque chemin vers un fichier du dépôt", () => {
    expect(cheminsAbsents(readFileSync(CARTE, "utf8"), existsSync)).toEqual([])
  })

  it("donne un chemin à chaque ligne du tableau", () => {
    const sansChemin = lignesDeDonnees(readFileSync(CARTE, "utf8")).filter(
      (ligne) => !LIEN_UNIQUE.test(ligne)
    )

    expect(
      sansChemin.map(
        (ligne) =>
          `« ${ligne} » ne nomme aucun chemin : une ligne sans destination est un mot que la carte ne mène nulle part.`
      )
    ).toEqual([])
  })

  it("porte assez de termes pour rester la carte", () => {
    expect(
      lignesDeDonnees(readFileSync(CARTE, "utf8")).length
    ).toBeGreaterThanOrEqual(30)
  })

  it("tombe quand un chemin de la carte est absent", () => {
    const carteSynthetique =
      "| refund | Remboursement | [`lib/absent.ts`](../lib/absent.ts) |"

    expect(cheminsAbsents(carteSynthetique, existsSync)).toEqual([
      expect.stringContaining("lib/absent.ts"),
    ])
  })
})
