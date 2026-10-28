import { z } from "zod"

import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { toIndexableProduct } from "@/lib/index-projection"
import { comparerStructures } from "@/lib/marche-structure"
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
  revalidateCategories(): Promise<void> | void
  deleteImage(url: string): Promise<void>
}

const defaultStructureEffects: StructureEffects = {
  reindexProducts: indexProductDocuments,
  revalidateCategories() {
    return invalidateStructure()
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

export class CategoryBusyError extends UserFacingError {
  constructor() {
    super("la Structure est en cours de modification, réessayez")
    this.name = "CategoryBusyError"
  }
}

export class CategoryTransactionExpiredError extends UserFacingError {
  constructor() {
    super("Refus de la Structure : la transaction a dépassé son délai")
    this.name = "CategoryTransactionExpiredError"
  }
}

export class CategoryAncestorCycleError extends UserFacingError {
  readonly arete: string | null

  constructor(cycle: readonly string[] = []) {
    const arete =
      cycle.length >= 2
        ? `${cycle[cycle.length - 2]} → ${cycle[cycle.length - 1]}`
        : null
    super(
      arete
        ? `Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle (${cycle.join(" → ")}) ; l'arête « ${arete} » le ferme`
        : "Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle"
    )
    this.name = "CategoryAncestorCycleError"
    this.arete = arete
  }
}

export const DELAI_VERROU_STRUCTURE_MS = 1000

const SQLSTATE_VERROU_INDISPONIBLE = "55P03"

const SQLSTATE_INTERBLOCAGE = "40P01"

const SQLSTATE_INTEGRITE = /^(23001|23503)$/

const CODE_TRANSACTION_EXPIREE = "P2028"

function sqlstateDeLErreur(error: unknown): string | undefined {
  const meta = (error as { meta?: unknown } | null)?.meta
  if (typeof meta !== "object" || meta === null) return undefined
  const lecteur = (meta as Record<string, unknown>).driverAdapterError as
    { cause?: { originalCode?: unknown } } | undefined
  const code = lecteur?.cause?.originalCode
  return typeof code === "string" ? code : undefined
}

function mapCourseDeStructure(error: unknown): never {
  if (error instanceof UserFacingError) throw error
  const sqlstate = sqlstateDeLErreur(error)
  const code = (error as { code?: unknown } | null)?.code
  if (code === CODE_TRANSACTION_EXPIREE)
    throw new CategoryTransactionExpiredError()
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

async function sousVerrouDeStructure<T>(
  body: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      await verrouillerStructure(tx)

      try {
        return await body(tx)
      } catch (error) {
        mapCategoryUniqueViolation(error)
      }
    })
  } catch (error) {
    mapCourseDeStructure(error)
  }
}

async function assertUniqueCategorySlug(
  slug: string,
  client: Prisma.TransactionClient,
  excludeCategoryId?: string
): Promise<void> {
  const existing = await client.category.findUnique({ where: { slug } })
  if (existing && existing.id !== excludeCategoryId)
    throw new CategorySlugConflictError()
}

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

interface MaillonStructure {
  id: string
  name: string
  parentId: string | null
}

async function lireChaineDesAncetres(
  parentId: string,
  client: Prisma.TransactionClient
): Promise<Map<string, MaillonStructure>> {
  const maillons = await client.$queryRaw<MaillonStructure[]>`
    WITH RECURSIVE ancetres AS (
      SELECT c.id, c.name, c."parentId"
      FROM "Category" c
      WHERE c.id = ${parentId}
      UNION
      SELECT p.id, p.name, p."parentId"
      FROM "Category" p
      JOIN ancetres a ON p.id = a."parentId"
    )
    SELECT id, name, "parentId" FROM ancetres
  `
  return new Map(maillons.map((maillon) => [maillon.id, maillon]))
}

async function assertAcyclicCategoryTree(
  id: string,
  parentId: string | null | undefined,
  client: Prisma.TransactionClient = prisma
): Promise<{ nomDestination: string | null }> {
  if (!parentId) return { nomDestination: null }
  if (parentId === id) {
    throw new CategoryValidationError([
      "une catégorie ne peut pas être sa propre parente",
    ])
  }
  const liens = await lireChaineDesAncetres(parentId, client)
  const vus = new Set<string>()
  const chemin: string[] = []
  let cursor: string | null = parentId
  while (cursor) {
    if (cursor === id) {
      throw new CategoryValidationError([
        "une catégorie ne peut pas être déplacée sous l'une de ses propres descendantes",
      ])
    }
    if (vus.has(cursor)) {
      const debut = chemin.indexOf(cursor)
      const cycle = [...chemin.slice(debut), cursor].map(
        (maillon) => liens.get(maillon)?.name ?? maillon
      )
      throw new CategoryAncestorCycleError(cycle)
    }
    vus.add(cursor)
    chemin.push(cursor)
    const maillon = liens.get(cursor)
    if (!maillon) {
      throw new CategoryValidationError(["catégorie parente inconnue"])
    }
    cursor = maillon.parentId
  }
  return { nomDestination: liens.get(parentId)?.name ?? null }
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

  const category = await sousVerrouDeStructure(async (tx) => {
    await assertUniqueCategorySlug(data.slug, tx)
    await assertCategoryParent(data.parentId, tx)

    return tx.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        parentId: data.parentId ?? null,
        image: data.image ?? null,
      },
    })
  })

  await runEffect({
    effet: "invalidation-cache",
    entite: { type: "categorie", id: category.id },
    message:
      "[structure] invalidation du cache non effectuée pour la création de catégorie",
    fn: () => effects.revalidateCategories(),
  })
  return category
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  overrides?: Partial<StructureEffects>
) {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const data = parseCategoryInput(input)

  const { category, image: imagePrecedente } = await sousVerrouDeStructure(
    async (tx) => {
      const existing = await tx.category.findUnique({ where: { id } })
      if (!existing) throw new CategoryNotFoundError()

      await assertUniqueCategorySlug(data.slug, tx, id)
      await assertAcyclicCategoryTree(id, data.parentId, tx)

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
    }
  )

  const nextImage = data.image ?? null
  if (imagePrecedente && imagePrecedente !== nextImage) {
    await runEffect({
      effet: "suppression-images",
      entite: { type: "categorie", id },
      message: `[structure] suppression d'image R2 non effectuée pour ${imagePrecedente}`,
      fn: () => effects.deleteImage(imagePrecedente!),
    })
  }
  const products = await readIndexableCategoryProducts(id)
  if (products.length > 0) {
    await runEffect({
      effet: "reindexation",
      entite: { type: "categorie", id },
      message: `[structure] réindexation meilisearch non effectuée pour ${id}`,
      fn: () => effects.reindexProducts(products),
    })
  }
  await runEffect({
    effet: "invalidation-cache",
    entite: { type: "categorie", id },
    message: `[structure] invalidation du cache non effectuée pour ${id}`,
    fn: () => effects.revalidateCategories(),
  })
  return category
}

export interface DeplacerStructureInput {
  id: string
  nouvelleParenteId: string | null
  avantId: string | null
}

export interface DeplacementStructure {
  nomDestination: string | null
  position: number
  nombreFreres: number
}

interface RangeeStructure {
  id: string
  name: string
  parentId: string | null
  position: number
}

const PAS_DE_POSITION = 1024

const deplacementSchema = z.object({
  id: z.string().min(1),
  nouvelleParenteId: z.string().min(1).nullable(),
  avantId: z.string().min(1).nullable(),
})

async function lireRangeeStructure(
  tx: Prisma.TransactionClient,
  id: string
): Promise<RangeeStructure | null> {
  const rangees = await tx.$queryRaw<RangeeStructure[]>`
    SELECT id, name, "parentId", position
    FROM "Category"
    WHERE id = ${id}
    LIMIT 1
  `
  return rangees[0] ?? null
}

async function lireFratrie(
  tx: Prisma.TransactionClient,
  parentId: string | null
): Promise<RangeeStructure[]> {
  if (parentId === null) {
    return tx.$queryRaw<RangeeStructure[]>`
      SELECT id, name, "parentId", position
      FROM "Category"
      WHERE "parentId" IS NULL
    `
  }
  return tx.$queryRaw<RangeeStructure[]>`
    SELECT id, name, "parentId", position
    FROM "Category"
    WHERE "parentId" = ${parentId}
  `
}

export async function deplacerStructure(
  input: DeplacerStructureInput,
  overrides?: Partial<StructureEffects>
): Promise<DeplacementStructure> {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const parsed = deplacementSchema.safeParse(input)
  if (!parsed.success) {
    throw new CategoryValidationError(
      parsed.error.issues.map((issue) => issue.message)
    )
  }
  const { id, nouvelleParenteId, avantId } = parsed.data

  const deplacement = await sousVerrouDeStructure(async (tx) => {
    if (avantId === id) {
      throw new CategoryValidationError([
        "une catégorie ne peut pas être insérée avant elle-même",
      ])
    }

    const rangee = await lireRangeeStructure(tx, id)
    if (!rangee) throw new CategoryNotFoundError()

    const { nomDestination } = await assertAcyclicCategoryTree(
      id,
      nouvelleParenteId,
      tx
    )

    const fratrie = (await lireFratrie(tx, nouvelleParenteId))
      .filter((sœur) => sœur.id !== id)
      .sort(comparerStructures)

    let rang = fratrie.length
    if (avantId !== null) {
      const insertion = fratrie.findIndex((sœur) => sœur.id === avantId)
      if (insertion === -1) {
        throw new CategoryValidationError([
          "la Structure d'insertion n'appartient pas aux sous-catégories de la destination",
        ])
      }
      rang = insertion
    }

    const ordonnee: RangeeStructure[] = [
      ...fratrie.slice(0, rang),
      { ...rangee, parentId: nouvelleParenteId },
      ...fratrie.slice(rang),
    ]

    for (const [index, sœur] of ordonnee.entries()) {
      const position = (index + 1) * PAS_DE_POSITION
      if (sœur.id === id) {
        await tx.category.update({
          where: { id },
          data: { parentId: nouvelleParenteId, position },
        })
      } else if (sœur.position !== position) {
        await tx.category.update({
          where: { id: sœur.id },
          data: { position },
        })
      }
    }

    return {
      nomDestination,
      position: rang + 1,
      nombreFreres: ordonnee.length,
    }
  })

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
  return deplacement
}

export async function deleteCategory(
  id: string,
  options: {
    reassignToCategoryId?: string
    reparentChildrenToCategoryId?: string
    orphanProducts?: boolean
  } = {},
  overrides?: Partial<StructureEffects>
): Promise<void> {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const reassignToCategoryId = options.reassignToCategoryId
  const reparentChildrenToCategoryId = options.reparentChildrenToCategoryId
  const laisseSansStructure =
    options.orphanProducts === true && !reassignToCategoryId

  const { image, movedProducts } = await sousVerrouDeStructure(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id },
      include: {
        children: { select: { id: true } },
        products: { select: { id: true } },
      },
    })
    if (!category) throw new CategoryNotFoundError()

    if (category.children.length > 0) {
      if (!reparentChildrenToCategoryId) throw new CategoryHasChildrenError()
      await assertCategoryParent(reparentChildrenToCategoryId, tx)
      await assertAcyclicCategoryTree(id, reparentChildrenToCategoryId, tx)
      await tx.category.updateMany({
        where: { parentId: id },
        data: { parentId: reparentChildrenToCategoryId },
      })
    }

    if (reassignToCategoryId) {
      if (reassignToCategoryId === id) {
        throw new CategoryValidationError([
          "une catégorie ne peut pas être réassignée vers elle-même",
        ])
      }
      await assertCategoryParent(reassignToCategoryId, tx)
    }

    let moved: IndexableProduct[] = []
    if (category.products.length > 0) {
      if (reassignToCategoryId) {
        await tx.product.updateMany({
          where: { categoryId: id },
          data: { categoryId: reassignToCategoryId },
        })
      } else if (!laisseSansStructure) {
        throw new CategoryHasProductsError(category.products.length)
      } else {
        await tx.product.updateMany({
          where: { categoryId: id },
          data: { categoryId: null },
        })
      }
      const movedRows = await tx.product.findMany({
        where: { id: { in: category.products.map((product) => product.id) } },
        include: { variants: true, category: true },
      })
      moved = movedRows.map(toIndexableProduct)
    }

    await tx.category.delete({ where: { id } })
    return { image: category.image, movedProducts: moved }
  })

  if (movedProducts.length > 0) {
    await runEffect({
      effet: "reindexation",
      entite: { type: "categorie", id },
      message: `[structure] réindexation meilisearch non effectuée pour ${id}`,
      fn: () => effects.reindexProducts(movedProducts),
    })
  }
  if (image) {
    await runEffect({
      effet: "suppression-images",
      entite: { type: "categorie", id },
      message: `[structure] suppression d'image R2 non effectuée pour ${image}`,
      fn: () => effects.deleteImage(image!),
    })
  }
  await runEffect({
    effet: "invalidation-cache",
    entite: { type: "categorie", id },
    message: `[structure] invalidation du cache non effectuée pour ${id}`,
    fn: () => effects.revalidateCategories(),
  })
}
