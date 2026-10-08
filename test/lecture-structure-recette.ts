import { vi } from "vitest"

import { prisma } from "@/lib/db"

/**
 * Les compteurs de lecture de la Structure, partagés par toutes les suites qui
 * mesurent ce qu'un écran paie.
 *
 * **Ce qu'ils comptent, et pourquoi deux.** La règle du module est « une lecture de
 * la Structure par exécution » (ADR-0030, US 23) ; l'instrument est donc le
 * client Prisma lui-même, et la couture que la Lecture traverse. Il faut deux
 * mesures, et non une, parce que la forme d'avant en faisait **deux** qu'une seule
 * expression n'en voyait qu'une : une lecture complète (`findMany` sans `where`
 * utile) et une lecture de rangée (`findUnique({ where: { slug } })`, celle que la
 * page de catégorie faisait pour se reconnaître). Une expression `/category\.
 * findMany/` aurait compte la première et laissé passer la seconde — donc donné
 * « une lecture » pour une page qui en faisait deux. `compterLesRequetesDeStructure`
 * est la mesure large, `compterLesLecturesDeLaStructure` la mesure étroite : la
 * première prouve qu'une requête **disparue** l'est, la seconde qu'une lecture
 * complète ne s'est pas **multipliée**.
 *
 * Elles vivaient dans le `describe` de `storefront.test.ts`, où seule la boutique
 * les utilisait, et une copie de la première était déjà née dans la suite de
 * l'écran de création. Trois copies d'un compteur de requêtes sont trois occasions
 * de mesurer deux choses différentes sous le même nom — c'est exactement le défaut
 * qu'un compteur partagé supprime. `test/mutation-squelette-recette.ts` est le
 * précédent de la forme : ce qui est réellement identique mérite un seul endroit,
 * et chaque suite garde ses propres invariants.
 *
 * **Le compte est pris pendant le rendu, et le rendu est fait une fois.** Chaque
 * fonction rend d'abord, compte ensuite, et restaure l'espion dans un `finally` :
 * une mesure qui n'entourait pas l'appel compterait les requêtes de la suite
 * entière — un fait vrai, et incapable de prouver quoi que ce soit sur l'écran.
 */
function estUneLectureComplete(args: { where?: object } | undefined): boolean {
  // Ce qui borne une lecture, c'est son `where` : la requête des enfants d'une
  // Structure (`where: { parentId }`) lit la table sans la parcourir, et ne compte
  // donc pas. Un `where` vide, lui, vaut « toutes les rangées » chez Prisma : il
  // compte.
  if (!args?.where) return true
  return Object.keys(args.where).length === 0
}

/**
 * Ce qu'un compteur rend : l'issue du rendu, et le nombre qu'il a compté. Les deux
 * types sont distincts plutôt qu'un seul porteur de deux champs, dont un aurait valu
 * zéro : une mesure qui rend un `0` dans le champ qu'on ne regarde pas se lit
 * comme une mesure faite.
 */
export interface RequetesComptees<T> {
  issue: T
  requetes: number
}

export interface LecturesComptees<T> {
  issue: T
  lectures: number
}

/**
 * **Toutes** les requêtes que le rendu adresse à la table `Category` — les
 * `findMany` et les `findUnique`, bornés ou non. C'est la mesure qui compte la
 * rangée qu'une page se reconnaît par son adresse, donc celle qui prouve que la
 * page de catégorie n'en fait plus (US 24).
 */
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

/** Le nombre de lectures **complètes** qu'un rendu a demandées, et son issue. */
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
