import { vi } from "vitest"

import { prisma } from "@/lib/db"

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
