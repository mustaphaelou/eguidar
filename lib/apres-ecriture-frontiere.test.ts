import { describe, expect, it } from "vitest"

import {
  atteignables,
  directive,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE = "lib/apres-ecriture.ts"
const BASE = "lib/db.ts"

const SYMBOLES = [
  "GenreEcriture",
  "FaitApresEcriture",
  "ConsequenceApresEcriture",
  "PlanApresEcriture",
  "declarerApresEcriture",
  "GENRES_DERIVES",
] as const

const MODULES_INTERDITS = [
  "lib/db",
  "lib/generated/prisma/client",
  "next/headers",
  "next/cache",
  "next/server",
  "next/navigation",
  "server-only",
  "react",
  "react-dom",
  "node:fs",
  "node:path",
  "node:crypto",
] as const

const ENTRETIENS_INTERDITS = [
  "await ",
  "$transaction",
  "prisma.",
  "fetch(",
  "process.env",
  "setTimeout",
] as const

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "./"
)
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))

function sourceDe(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source de production absente : ${chemin}`)
  return trouvee
}

const SOURCE = sourceDe(MODULE).source

const REFERENCES = /^\s*import\s+([^;]*?)\s+from\s+["']([^"']+)["']/gm

function clausesDImport(
  source: string
): { clause: string; specifieur: string }[] {
  return [...source.matchAll(REFERENCES)].map(([, clause, specifieur]) => ({
    clause: clause!,
    specifieur: specifieur!,
  }))
}

function genresDeclares(source: string): string[] {
  const bloc = source.match(/export type GenreEcriture =([\s\S]*?)\n\nexport/)
  if (!bloc) throw new Error("La déclaration GenreEcriture est introuvable")
  return [...bloc[1]!.matchAll(/"([a-z][a-z.-]*)"/g)].map(([, genre]) => genre!)
}

function genresDuRegistre(source: string): string[] {
  const bloc = source.match(/const REGISTRE(?::[^=\n]+)? = \{([\s\S]*?)\n\}/)
  if (!bloc) throw new Error("Le registre Après-écriture est introuvable")
  return [...bloc[1]!.matchAll(/^\s*"([a-z][a-z.-]*)":/gm)].map(
    ([, genre]) => genre!
  )
}

describe("Après-écriture — garde de pureté", () => {
  it("le module déclare ses symboles et ne porte aucune directive", () => {
    for (const symbole of SYMBOLES) {
      expect(SOURCE, symbole).toContain(symbole)
    }

    expect(directive(SOURCE)).toBeNull()
    expect(SOURCE).not.toMatch(/^["']use client["']/m)
    expect(SOURCE).not.toMatch(/^["']use server["']/m)
    expect(SOURCE).not.toMatch(/\buse[A-Z]\w*\(/)
    expect(SOURCE).not.toMatch(/from\s*["']node:/)
  })

  it("n'importe que des types : aucune valeur n'entre dans le module", () => {
    const clauses = clausesDImport(SOURCE)
    expect(clauses.length).toBeGreaterThan(0)

    for (const { clause, specifieur } of clauses) {
      expect(clause, specifieur).toMatch(/^type\b/)
    }

    for (const nom of MODULES_INTERDITS) {
      expect(importeDe(SOURCE, nom), MODULE + " → " + nom).toBe(false)
    }
  })

  it("le graphe de valeur du module est le module seul", () => {
    expect(PAR_CHEMIN.has(MODULE)).toBe(true)

    const atteints = atteignables(MODULE, PAR_CHEMIN)
    expect([...atteints]).toEqual([MODULE])
  })

  it("n'écrit ni entrée-sortie, ni transaction, ni attente", () => {
    for (const interdit of ENTRETIENS_INTERDITS) {
      expect(SOURCE, interdit).not.toContain(interdit)
    }
  })

  it("le registre couvre exactement les genres déclarés, sans doublon", () => {
    const declares = genresDeclares(SOURCE).sort()
    const registre = genresDuRegistre(SOURCE).sort()

    expect(declares.length).toBeGreaterThanOrEqual(15)
    expect(new Set(registre).size).toBe(registre.length)
    expect(registre).toEqual(declares)
  })

  it("fixe l'annotation exhaustive du registre", () => {
    // L'annotation est le contrat : un genre ajouté sans déclaration ne
    // compile pas. La retirer rendrait le registre partiel sans rien casser
    // ici, d'où cette garde sur le texte exact.
    expect(SOURCE).toContain(
      "const REGISTRE: { [G in GenreEcriture]: DeclarationPour<G> } = {"
    )
  })

  it("les genres dérivés sont unitaires : aucun genre groupé n'y entre", async () => {
    const { GENRES_DERIVES } = await import("@/lib/apres-ecriture")

    expect(GENRES_DERIVES.length).toBeGreaterThan(0)
    for (const genre of GENRES_DERIVES) {
      expect(genre.endsWith(".lot"), genre).toBe(false)
    }
  })

  it("la garde tombe sur une violation synthétique écrite dans le module réel", () => {
    const premiere = SOURCE.split("\n")[0]!
    const enViolation = `${premiere}\nimport { prisma } from "@/lib/db"\n${SOURCE.slice(premiere.length)}`

    expect(enViolation).not.toBe(SOURCE)
    expect(importeDe(enViolation, BASE)).toBe(true)
    expect(
      clausesDImport(enViolation).filter(
        ({ clause }) => !/^type\b/.test(clause)
      )
    ).toHaveLength(1)
    expect(
      clausesDImport(SOURCE).filter(({ clause }) => !/^type\b/.test(clause))
    ).toHaveLength(0)
  })
})
