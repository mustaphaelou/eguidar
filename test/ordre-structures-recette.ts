import { describe, expect, it } from "vitest"

import type { FaitStructure } from "@/lib/use-cases/lecture-structure"

export const ORDRE_ATTENDU = ["ecran", "jumeau-a", "jumeau-b", "zebre"] as const

const FAITS: readonly FaitStructure[] = [
  {
    id: "racine",
    name: "Racine",
    slug: "racine",
    image: null,
    parentId: null,
    produitsDirects: 0,
  },
  {
    id: "zebre",
    name: "Zèbre",
    slug: "zebre",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
  {
    id: "ecran",
    name: "Écran",
    slug: "ecran",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
  {
    id: "jumeau-b",
    name: "Jumeau",
    slug: "aaa-jumeau",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
  {
    id: "jumeau-a",
    name: "Jumeau",
    slug: "zzz-jumeau",
    image: null,
    parentId: "racine",
    produitsDirects: 0,
  },
]

export function dansLOrdreEprouve(ids: readonly string[]): string[] {
  return ids.filter((id) => (ORDRE_ATTENDU as readonly string[]).includes(id))
}

export type ProjeterDansLOrdre = (
  faits: readonly FaitStructure[]
) => readonly string[]

export interface RecetteOrdre {
  nom: string
  projeter: ProjeterDansLOrdre
}

export function eprouverLOrdreDuModule({ nom, projeter }: RecetteOrdre): void {
  describe(`${nom} — l'ordre que le module promet`, () => {
    it("départage les Structures de même nom par leur identifiant, et lit les accents en français", () => {
      expect(dansLOrdreEprouve(projeter(FAITS))).toEqual([...ORDRE_ATTENDU])
    })
  })
}

export interface OrdreRendu {
  nom: string
  ids: readonly string[]
}

export function exigerLeMemeOrdre(parties: readonly OrdreRendu[]): void {
  const [reference, ...autres] = parties
  expect(
    reference?.ids.length ?? 0,
    reference?.nom ?? "aucune forme"
  ).toBeGreaterThan(0)
  for (const autre of autres) {
    expect(
      autre.ids,
      `${autre.nom} — même ordre que ${reference?.nom}`
    ).toEqual([...(reference?.ids ?? [])])
  }
}
