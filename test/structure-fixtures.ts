import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"
import { slugify } from "@/lib/slug"

const runId = randomUUID().slice(0, 8)
let rang = 0

const PREFIXE_FIXTURE = `structure-${runId}-`

function slugNeuf(name: string, prefix: string): string {
  rang += 1
  return `${prefix}${rang}-${slugify(name) || "sans-nom"}`
}

export interface StructureCreee {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
}

export function creerStructure(input: {
  name: string
  parentId?: string | null
  image?: string | null
  prefix?: string
}): Promise<StructureCreee> {
  return prisma.category.create({
    data: {
      name: input.name,
      slug: slugNeuf(input.name, input.prefix ?? PREFIXE_FIXTURE),
      parentId: input.parentId ?? null,
      image: input.image ?? null,
    },
    select: { id: true, name: true, slug: true, image: true, parentId: true },
  })
}

export async function creerArbrePropre(
  arbre: Record<
    string,
    { name: string; parent?: string; image?: string | null }
  >,
  prefix?: string
): Promise<Record<string, StructureCreee>> {
  const crees: Record<string, StructureCreee> = {}
  for (const [cle, entree] of Object.entries(arbre)) {
    const parente = entree.parent ? crees[entree.parent] : undefined
    if (entree.parent && !parente) {
      throw new Error(
        `arbre propre : la clé « ${cle} » nomme une parente « ${entree.parent} » absente ou écrite après elle`
      )
    }
    crees[cle] = await creerStructure({
      name: entree.name,
      parentId: parente?.id ?? null,
      image: entree.image ?? null,
      prefix,
    })
  }
  return crees
}

export async function planterUnCycleEnBase(ids: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.category.update({
        where: { id },
        data: { parentId: ids[(index + 1) % ids.length] },
      })
    }
  })
}
