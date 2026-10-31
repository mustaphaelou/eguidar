import { vi } from "vitest"

import { prisma } from "@/lib/db"
import type {
  FaitStructure,
  NoeudAccueil,
} from "@/lib/use-cases/lecture-structure"

export function structure(
  id: string,
  name: string,
  parentId: string | null,
  produitsDirects = 0,
  image: string | null = null,
  position = 0
): FaitStructure {
  return { id, name, slug: id, image, parentId, produitsDirects, position }
}

export function tousLesNoeuds(noeuds: readonly NoeudAccueil[]): NoeudAccueil[] {
  const tous: NoeudAccueil[] = []
  const pile = [...noeuds].reverse()
  while (pile.length > 0) {
    const noeud = pile.pop()!
    tous.push(noeud)
    for (let rang = noeud.children.length - 1; rang >= 0; rang -= 1) {
      pile.push(noeud.children[rang]!)
    }
  }
  return tous
}

function estUneLectureComplete(args: { where?: object } | undefined): boolean {
  if (!args?.where) return true
  return Object.keys(args.where).length === 0
}

export interface RequetesComptees<T> {
  issue: T
  requetes: number
}

export interface LecturesComptees<T> {
  issue: T
  lectures: number
}

export async function compterLesRequetesDeStructure<T>(
  rendre: () => Promise<T>
): Promise<RequetesComptees<T>> {
  const findMany = vi.spyOn(prisma.category, "findMany")
  const findUnique = vi.spyOn(prisma.category, "findUnique")
  try {
    const issue = await rendre()
    return {
      issue,
      requetes: findMany.mock.calls.length + findUnique.mock.calls.length,
    }
  } finally {
    findMany.mockRestore()
    findUnique.mockRestore()
  }
}

export async function compterLesLecturesDeLaStructure<T>(
  rendre: () => Promise<T>
): Promise<LecturesComptees<T>> {
  const espion = vi.spyOn(prisma.category, "findMany")
  try {
    const issue = await rendre()
    return {
      issue,
      lectures: espion.mock.calls.filter(([args]) =>
        estUneLectureComplete(args)
      ).length,
    }
  } finally {
    espion.mockRestore()
  }
}
