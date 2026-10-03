import { z } from "zod"

import { prisma } from "@/lib/db"
import type { Category, Prisma } from "@/lib/generated/prisma/client"
import { toIndexableProduct } from "@/lib/index-projection"
import type { IndexableProduct } from "@/lib/index-projection"
import { indexProductDocuments } from "@/lib/meili"
import { stockageImageProduitR2 } from "@/lib/r2"
import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"
import {
  avecSurcharges,
  leverConflitUnique,
  messageDeValidation,
  runEffect,
} from "@/lib/use-cases/mutation-squelette"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export interface CategoryInput {
  name: string
  slug: string
  parentId?: string | null
  image?: string | null
}

export interface StructureEffects {
  reindexProducts(products: IndexableProduct[]): Promise<void>
  revalidateCategories(): void
  /**
   * Supprime l'image de catégorie donnée, en best-effort.
   * Invariant : ne rejette jamais — un échec de suppression R2 ne doit pas
   * faire échouer la mutation (ADR-0004).
   */
  deleteImage(url: string): Promise<void>
}

const defaultStructureEffects: StructureEffects = {
  reindexProducts: indexProductDocuments,
  revalidateCategories() {
    invalidateStructure()
  },
  async deleteImage(url) {
    try {
      const resultat = await stockageImageProduitR2.supprimerImageCategorie(url)
      if (!resultat.ok) {
        console.warn(
          `[structure] suppression d'image R2 non effectuée pour ${url}`,
          resultat.erreur
        )
      }
    } catch (error) {
      console.warn(
        `[structure] suppression d'image R2 non effectuée pour ${url}`,
        error
      )
    }
  },
}

export class CategoryValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "CategoryValidationError"
  }
}

export class CategorySlugConflictError extends UserFacingError {
  constructor() {
    super("Une catégorie avec ce slug existe déjà")
    this.name = "CategorySlugConflictError"
  }
}

export class CategoryNotFoundError extends UserFacingError {
  constructor() {
    super("Catégorie introuvable")
    this.name = "CategoryNotFoundError"
  }
}

export class CategoryHasChildrenError extends UserFacingError {
  constructor() {
    super("Refus de la Structure : elle contient des sous-catégories")
    this.name = "CategoryHasChildrenError"
  }
}

export class CategoryHasProductsError extends UserFacingError {
  constructor(productCount: number) {
    const pluriel = productCount > 1
    super(
      `Refus de la Structure : ${productCount} Produit${pluriel ? "s" : ""} lui ${pluriel ? "sont" : "est"} rattaché${pluriel ? "s" : ""}`
    )
    this.name = "CategoryHasProductsError"
  }
}

/**
 * La Structure est en train de changer sous les pieds de l'éditeur : une autre
 * mutation la tient verrouillée, le délai de verrou a expiré, ou une écriture
 * a franchi le verrou et contredit ce que la transaction avait lu. Trois
 * routes, un seul refus — l'éditeur n'a qu'une chose à faire, réessayer.
 */
export class CategoryBusyError extends UserFacingError {
  constructor() {
    super("la Structure est en cours de modification, réessayez")
    this.name = "CategoryBusyError"
  }
}

/**
 * Le délai d'attente d'un verrou, en millisecondes. Plus court que le délai
 * d'une transaction interactive Prisma — 5 000 ms par défaut, qu'aucune
 * option de ce dépôt ne change : fail-fast vaut mieux qu'une transaction
 * pendante qui bloque tout le monde (ADR-0027).
 *
 * Exporté pour que l'épreuve de contention sache jusqu'où elle peut attendre
 * avant de conclure qu'un refus vient du verrou.
 */
export const DELAI_VERROU_STRUCTURE_MS = 1000

/** Le SQLSTATE `lock_not_available`, que PostgreSQL lève au dépassement. */
const SQLSTATE_VERROU_INDISPONIBLE = "55P03"

/** Le SQLSTATE `deadlock_detected`. */
const SQLSTATE_INTERBLOCAGE = "40P01"

/**
 * Les deux SQLSTATEs d'intégrité qu'une transaction de suppression peut
 * rencontrer : `23001` est ce que lève le déclencheur d'intégrité
 * référentielle sur un `ON DELETE RESTRICT` — `Product_categoryId_fkey` — et
 * `23503` la violation de clé étrangère elle-même. Les deux ont été relevés
 * sur un vrai PostgreSQL ; aucun autre n'est atteignable ici, la transaction
 * n'écrivant que des `parentId` et des `categoryId`.
 */
const SQLSTATE_INTEGRITE = /^(23001|23503)$/

/**
 * Le SQLSTATE de la base, lu dans la cause du lecteur d'adaptateur : la seule
 * voix qui ne dépende ni de la langue du serveur, ni du code que Prisma
 * choisit de revêtir — celui-ci a déjà varié d'un environnement à l'autre
 * (P2039 ici, P2003 ailleurs).
 *
 * La lecture est structurelle et non un `instanceof` : une version de Prisma
 * qui classerait l'erreur autrement laisserait le refus se cacher, et
 * l'appelant ne verrait qu'une erreur de lecteur.
 */
function sqlstateDeLErreur(error: unknown): string | undefined {
  const meta = (error as { meta?: unknown } | null)?.meta
  if (typeof meta !== "object" || meta === null) return undefined
  const lecteur = (meta as Record<string, unknown>).driverAdapterError as
    { cause?: { originalCode?: unknown } } | undefined
  const code = lecteur?.cause?.originalCode
  return typeof code === "string" ? code : undefined
}

/**
 * La traduction des courses (ADR-0027). Un dépassement de verrou, un
 * interblocage et une violation de clé étrangère sont trois refus de la
 * Structure, jamais des erreurs de lecteur : `adminFormAction` relance toute
 * erreur qu'elle ne reconnaît pas comme un `UserFacingError`, donc une erreur
 * brute sort de l'action serveur en exception non rattrapée.
 *
 * Le SQLSTATE décide ; le code Prisma ne départage que ce qu'il sait seul, `P2003`
 * étant réservé aux clés étrangères et `P2034` aux interblocages. Le refus
 * métier que la transaction a déjà levé passe avant tout, intact.
 *
 * L'interblocage est ici et non ailleurs : le verrou grossier prend les
 * Structures avant les Produits, quand toute écriture du Catalogue prend le
 * Produit avant la Structure. L'ordre inverse est un piège nommé d'ADR-0027,
 * et le perdant d'un tel cycle n'a lui aussi qu'une chose à faire.
 */
function mapCourseDeStructure(error: unknown): never {
  if (error instanceof UserFacingError) throw error
  const sqlstate = sqlstateDeLErreur(error)
  const code = (error as { code?: unknown } | null)?.code
  if (
    sqlstate === SQLSTATE_VERROU_INDISPONIBLE ||
    sqlstate === SQLSTATE_INTERBLOCAGE ||
    (sqlstate !== undefined && SQLSTATE_INTEGRITE.test(sqlstate)) ||
    code === "P2003" ||
    code === "P2034"
  ) {
    throw new CategoryBusyError()
  }
  throw error
}

/**
 * Le verrou grossier de la Structure (ADR-0027) : `SELECT … FROM "Category"
 * FOR UPDATE` prend toute la table, donc tout l'arbre. Verrouiller chaque
 * Structure plutôt que le nœud visé est ce qui ferme la course de cycle :
 * `assertAcyclicCategoryTree` parcourt une chaîne d'ancêtres qu'un verrou de
 * nœud ne protège pas. La décision l'exige de toute mutation de Structure,
 * création d'une Structure racine comprise : personne n'y échappe, pas même
 * elle.
 *
 * Le délai s'arme **avant** le verrou, et c'est l'inversion d'ADR-0027 qu'elle
 * corrige : pris après, il ne bornait que les verrous suivants et laissait
 * l'attente du verrou grossier — la plus longue, celle qui précède toutes les
 * autres — à la seule bonne volonté de Prisma. Armé avant, il borne celle-là
 * aussi, et le premier verrou pris reste le verrou grossier. Poser un réglage
 * ne prend aucun verrou : l'ordre ne coûte donc rien.
 *
 * `set_config(..., true)` *est* le `SET LOCAL` qu'ADR-0027 nomme ; il est écrit
 * ainsi parce que PostgreSQL n'accepte pas de paramètre dans un `SET`, et que
 * Prisma envoie toute requête `$queryRaw` préparée.
 */
async function verrouillerStructure(
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${DELAI_VERROU_STRUCTURE_MS}ms`}, true)`
  await tx.$queryRaw`SELECT id FROM "Category" FOR UPDATE`
}

const slugSchema = z
  .string()
  .min(1, "slug requis")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug invalide (minuscules, chiffres et tirets uniquement)"
  )

const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "nom requis"),
  slug: slugSchema,
  parentId: z.string().min(1).nullable().optional(),
  image: z.string().nullable().optional(),
})

function parseCategoryInput(input: CategoryInput): CategoryInput {
  const result = categoryInputSchema.safeParse(input)
  if (!result.success) {
    throw new CategoryValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function mapCategoryUniqueViolation(error: unknown): never {
  return leverConflitUnique(
    error,
    [{ champs: ["slug"], erreur: new CategorySlugConflictError() }],
    hasUniqueViolation
  )
}

/**
 * Le slug est-il déjà porté par une autre Structure ? Le client est celui de la
 * transaction, et il n'a pas de défaut : sous le verrou grossier, cette lecture
 * valide et écrit dans un seul engagement, et une lecture hors transaction
 * prendrait une seconde connexion pendant que la première tient le verrou.
 */
async function assertUniqueCategorySlug(
  slug: string,
  client: Prisma.TransactionClient,
  excludeCategoryId?: string
): Promise<void> {
  const existing = await client.category.findUnique({ where: { slug } })
  if (existing && existing.id !== excludeCategoryId)
    throw new CategorySlugConflictError()
}

/**
 * La catégorie cible existe-t-elle ? Le client partagé avec le chemin de
 * suppression y fait lire cette validation dans la même transaction que les
 * écritures : validation et écritures s'appuient sur un seul engagement.
 */
async function assertCategoryParent(
  parentId: string | null | undefined,
  client: Prisma.TransactionClient = prisma
): Promise<void> {
  if (!parentId) return
  const parent = await client.category.findUnique({
    where: { id: parentId },
    select: { id: true },
  })
  if (!parent) throw new CategoryValidationError(["catégorie parente inconnue"])
}

async function assertAcyclicCategoryTree(
  id: string,
  parentId: string | null | undefined,
  client: Prisma.TransactionClient = prisma
): Promise<void> {
  if (!parentId) return
  if (parentId === id) {
    throw new CategoryValidationError([
      "une catégorie ne peut pas être sa propre parente",
    ])
  }
  let cursor: string | null = parentId
  while (cursor) {
    if (cursor === id) {
      throw new CategoryValidationError([
        "une catégorie ne peut pas être déplacée sous l'une de ses propres descendantes",
      ])
    }
    const parent: { parentId: string | null } | null =
      await client.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      })
    if (!parent)
      throw new CategoryValidationError(["catégorie parente inconnue"])
    cursor = parent.parentId
  }
}

async function readIndexableCategoryProducts(
  categoryId: string
): Promise<IndexableProduct[]> {
  const products = await prisma.product.findMany({
    where: { categoryId },
    include: { variants: true, category: true },
  })
  return products.map(toIndexableProduct)
}

export async function createCategory(
  input: CategoryInput,
  overrides?: Partial<StructureEffects>
) {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const data = parseCategoryInput(input)

  // Une seule mutation atomique et sérialisée, comme les deux autres : la
  // transaction prend le délai puis le verrou grossier en première instruction
  // qui verrouille, avant la lecture du slug, celle du parent et l'écriture,
  // qui partagent un seul engagement. Une insertion de racine ne pose aucune
  // référence de clé étrangère, donc rien à verrouiller d'elle-même : le verrou
  // ne protège pas sa propre course — deux racines concurrentes se committent
  // toutes deux tant que la gagnante engage moins que le délai — il tient la
  // promesse que deux mutations de Structure ne s'entrelacent jamais
  // (ADR-0027).
  let category: Category
  try {
    category = await prisma.$transaction(async (tx) => {
      await verrouillerStructure(tx)

      await assertUniqueCategorySlug(data.slug, tx)
      await assertCategoryParent(data.parentId, tx)

      try {
        return await tx.category.create({
          data: {
            name: data.name,
            slug: data.slug,
            parentId: data.parentId ?? null,
            image: data.image ?? null,
          },
        })
      } catch (error) {
        mapCategoryUniqueViolation(error)
      }
    })
  } catch (error) {
    mapCourseDeStructure(error)
  }

  await runEffect(
    "[structure] invalidation du cache non effectuée pour la création de catégorie",
    () => effects.revalidateCategories()
  )
  return category
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  overrides?: Partial<StructureEffects>
) {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const data = parseCategoryInput(input)

  // Une seule mutation atomique et sérialisée, comme la suppression : le délai
  // de verrou s'arme, puis le verrou grossier prend tout l'arbre en première
  // instruction qui verrouille, avant la lecture de la Structure, la marche
  // d'acyclicité et l'écriture, qui partagent une même transaction — la
  // vérification d'acyclicité lit et écrit dans un seul engagement, et deux
  // modifications de Structure ne s'entrelacent jamais (ADR-0027).
  let resultat: { category: Category; image: string | null }
  try {
    resultat = await prisma.$transaction(async (tx) => {
      await verrouillerStructure(tx)

      const existing = await tx.category.findUnique({ where: { id } })
      if (!existing) throw new CategoryNotFoundError()

      await assertUniqueCategorySlug(data.slug, tx, id)
      await assertAcyclicCategoryTree(id, data.parentId, tx)

      try {
        const category = await tx.category.update({
          where: { id },
          data: {
            name: data.name,
            slug: data.slug,
            parentId: data.parentId ?? null,
            image: data.image ?? null,
          },
        })
        return { category, image: existing.image }
      } catch (error) {
        mapCategoryUniqueViolation(error)
      }
    })
  } catch (error) {
    mapCourseDeStructure(error)
  }
  const { category, image: imagePrecedente } = resultat

  const nextImage = data.image ?? null
  if (imagePrecedente && imagePrecedente !== nextImage) {
    await runEffect(
      `[structure] suppression d'image R2 non effectuée pour ${imagePrecedente}`,
      () => effects.deleteImage(imagePrecedente!)
    )
  }
  const products = await readIndexableCategoryProducts(id)
  if (products.length > 0) {
    await runEffect(
      `[structure] réindexation meilisearch non effectuée pour ${id}`,
      () => effects.reindexProducts(products)
    )
  }
  await runEffect(
    `[structure] invalidation du cache non effectuée pour ${id}`,
    () => effects.revalidateCategories()
  )
  return category
}

/**
 * Les options métier précèdent la surcharge d'effets : l'appelant de
 * production exprime sa réaffectation sans `undefined` pont, et la couture
 * d'effets reste le paramètre optionnel de dernier rang (ADR-0014).
 *
 * `reparentChildrenToCategoryId` est la Structure que l'éditeur a choisie pour
 * accueillir les sous-catégories : sans elle, la Structure qui a des enfants
 * reste refusée. La règle ne s'assouplit pas — elle devient saisissable.
 */
export async function deleteCategory(
  id: string,
  options: {
    reassignToCategoryId?: string
    reparentChildrenToCategoryId?: string
  } = {},
  overrides?: Partial<StructureEffects>
): Promise<void> {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const reassignToCategoryId = options.reassignToCategoryId
  const reparentChildrenToCategoryId = options.reparentChildrenToCategoryId

  // Une seule mutation atomique et sérialisée : le délai de verrou s'arme,
  // puis le verrou grossier prend tout l'arbre en première instruction qui
  // verrouille, avant la lecture propre à la suppression, les validations de
  // réaffectation, le déplacement des Produits, le réattribut des
  // sous-catégories, leur projeté indexable et la suppression de la Structure
  // source — tout cela dans une même transaction. Un échec de la suppression
  // finale annule donc la réaffectation — la base fait foi (ADR-0014) — et deux
  // suppressions ne s'entrelacent jamais (ADR-0027).
  let resultat: { image: string | null; movedProducts: IndexableProduct[] }
  try {
    resultat = await prisma.$transaction(async (tx) => {
      await verrouillerStructure(tx)

      const category = await tx.category.findUnique({
        where: { id },
        include: {
          children: { select: { id: true } },
          products: { select: { id: true } },
        },
      })
      if (!category) throw new CategoryNotFoundError()

      // Le réattribut précède la suppression : `Category_parentId_fkey` est en
      // `ON DELETE SET NULL`, et sans cette écriture les enfants remonte-
      // raient silencieusement au rang racine. L'ordre est donc le refus, puis
      // l'écriture.
      if (category.children.length > 0) {
        if (!reparentChildrenToCategoryId) throw new CategoryHasChildrenError()
        await assertCategoryParent(reparentChildrenToCategoryId, tx)
        // Rattacher à elle-même ou à l'une de ses descendantes refermerait la
        // boucle : la même marche que celle de la modification, mais sur le
        // client de la transaction, pour ne lire que des faits engagés.
        await assertAcyclicCategoryTree(id, reparentChildrenToCategoryId, tx)
        await tx.category.updateMany({
          where: { parentId: id },
          data: { parentId: reparentChildrenToCategoryId },
        })
      }

      let moved: IndexableProduct[] = []
      if (reassignToCategoryId) {
        if (reassignToCategoryId === id) {
          throw new CategoryValidationError([
            "une catégorie ne peut pas être réassignée vers elle-même",
          ])
        }
        await assertCategoryParent(reassignToCategoryId, tx)
        if (category.products.length > 0) {
          await tx.product.updateMany({
            where: { categoryId: id },
            data: { categoryId: reassignToCategoryId },
          })
          const movedRows = await tx.product.findMany({
            where: {
              id: { in: category.products.map((product) => product.id) },
            },
            include: { variants: true, category: true },
          })
          moved = movedRows.map(toIndexableProduct)
        }
      } else if (category.products.length > 0) {
        throw new CategoryHasProductsError(category.products.length)
      }

      await tx.category.delete({ where: { id } })
      return { image: category.image, movedProducts: moved }
    })
  } catch (error) {
    mapCourseDeStructure(error)
  }
  const { image, movedProducts } = resultat

  // Les effets auxiliaires n'attendent que le commit : les faits qu'ils
  // reçoivent sont committés et leur échec reste best-effort (ADR-0014).
  if (movedProducts.length > 0) {
    await runEffect(
      `[structure] réindexation meilisearch non effectuée pour ${id}`,
      () => effects.reindexProducts(movedProducts)
    )
  }
  if (image) {
    await runEffect(
      `[structure] suppression d'image R2 non effectuée pour ${image}`,
      () => effects.deleteImage(image!)
    )
  }
  await runEffect(
    `[structure] invalidation du cache non effectuée pour ${id}`,
    () => effects.revalidateCategories()
  )
}

export function listAdminCategoriesWithCounts() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { products: true, children: true } },
    },
  })
}
