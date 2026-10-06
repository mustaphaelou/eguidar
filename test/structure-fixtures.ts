import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"
import { slugify } from "@/lib/slug"

/**
 * Les deux formes de Structure que les suites plantent : un arbre propre, et
 * le cycle qu'une Tierce partie referme en base.
 *
 * Un cycle arrive par un import, une reprise ou une correction manuelle — le
 * verrou d'ADR-0027 interdit d'en former un par l'interface, pas d'en recevoir
 * un — et les marches du dépôt doivent toutes s'y arrêter. La façon de le
 * planter était écrite deux fois, à la main
 * (`admin-structure.test.ts`, `storefront.test.ts`) ; elle vit ici avant
 * qu'une troisième marche ne la recopie, et l'arbre propre vient à côté parce
 * que le cas ordinaire ne doit pas coûter plus cher que le cas corrompu
 * (ADR-0030, #546).
 *
 * Les slugs sont uniques par exécution, comme les deux copies locales que ce
 * module remplace : deux suites ne peuvent pas se heurter sur un slug, et une
 * rangée laissée par une épreuve échouée ne bloque pas la suivante.
 */

const runId = randomUUID().slice(0, 8)
let rang = 0

/** Un slug neuf, unique dans l'exécution, et lisible dans un message d'échec. */
function slugNeuf(name: string): string {
  rang += 1
  return `structure-${runId}-${rang}-${slugify(name) || "sans-nom"}`
}

/** Ce qu'une Structure créée par ces fixtures rend à sa suite : de quoi
 *  l'asserter, la nettoyer, et la nommer dans un message. */
export interface StructureCreee {
  id: string
  name: string
  slug: string
  parentId: string | null
}

/**
 * Une Structure, écrite directement en base : ces fixtures plantent l'état
 * d'avant la lecture, elles ne passent pas par les mutations de Structure —
 * et n'ont donc pas à attendre le verrou grossier d'ADR-0027.
 */
export function creerStructure(input: {
  name: string
  parentId?: string | null
  image?: string | null
}): Promise<StructureCreee> {
  return prisma.category.create({
    data: {
      name: input.name,
      slug: slugNeuf(input.name),
      parentId: input.parentId ?? null,
      image: input.image ?? null,
    },
    select: { id: true, name: true, slug: true, parentId: true },
  })
}

/**
 * Un arbre propre : chaque entrée nomme sa parente par sa clé, et l'ordre de
 * l'objet est l'ordre d'écriture — une entrée ne peut donc nommer qu'une clé
 * déjà écrite. Une clé inconnue lève au lieu de planter une racine muette :
 * l'épreuve qui attendait une descendante doit l'apprendre ici, pas par une
 * assertion d'exclusion incompréhensible.
 */
export async function creerArbrePropre(
  arbre: Record<string, { name: string; parent?: string }>
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
    })
  }
  return crees
}

/**
 * Une Tierce partie referme un cycle **directement en base**, hors de toute
 * mutation de Structure : c'est ainsi qu'un cycle arrive dans les données — un
 * import, une reprise, une correction manuelle. Le verrou d'ADR-0027 interdit
 * d'en former un par l'interface, pas d'en recevoir un.
 *
 * Les écritures passent par le client de la transaction, jamais par une
 * mutation de Structure : ce sont précisément elles que le cycle doit
 * contourner. `ids` est parcouru dans l'ordre, chacun reçoit le suivant pour
 * parente, et le dernier referme la boucle sur le premier.
 */
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
