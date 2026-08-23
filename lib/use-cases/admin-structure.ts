import { z } from "zod"

import { prisma } from "@/lib/db"
import { toIndexableProduct } from "@/lib/index-projection"
import type { IndexableProduct } from "@/lib/index-projection"
import { deleteR2Object } from "@/lib/r2"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

async function deleteR2ObjectIfChanged(previous: string | null, next: string | null): Promise<void> {
  if (!previous || previous === next) return
  try {
    await deleteR2Object(previous)
  } catch {
    // Best-effort : un échec de suppression R2 ne doit pas bloquer la mutation.
  }
}

export interface CategoryInput {
  name: string
  slug: string
  parentId?: string | null
  image?: string | null
}

export interface StructureEffects {
  reindexProducts(products: IndexableProduct[]): Promise<void>
  revalidateCategories(): void
}

export class CategoryValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
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
    super("Impossible de supprimer : la catégorie contient des sous-catégories")
    this.name = "CategoryHasChildrenError"
  }
}

export class CategoryHasProductsError extends UserFacingError {
  constructor(productCount: number) {
    super(
      `Impossible de supprimer : ${productCount} produit${productCount > 1 ? "s" : ""} lui est/sont rattaché(s)`
    )
    this.name = "CategoryHasProductsError"
  }
}

const slugSchema = z
  .string()
  .min(1, "slug requis")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug invalide (minuscules, chiffres et tirets uniquement)")

const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "nom requis"),
  slug: slugSchema,
  parentId: z.string().min(1).nullable().optional(),
  image: z.string().nullable().optional(),
})

function parseCategoryInput(input: CategoryInput): CategoryInput {
  const result = categoryInputSchema.safeParse(input)
  if (!result.success) {
    throw new CategoryValidationError(result.error.issues.map((issue) => issue.message))
  }
  return result.data
}

function mapCategoryUniqueViolation(error: unknown): never {
  if (hasUniqueViolation(error, ["slug"])) throw new CategorySlugConflictError()
  throw error
}

async function assertUniqueCategorySlug(slug: string, excludeCategoryId?: string): Promise<void> {
  const existing = await prisma.category.findUnique({ where: { slug } })
  if (existing && existing.id !== excludeCategoryId) throw new CategorySlugConflictError()
}

async function assertCategoryParent(parentId: string | null | undefined): Promise<void> {
  if (!parentId) return
  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { id: true } })
  if (!parent) throw new CategoryValidationError(["catégorie parente inconnue"])
}

async function assertAcyclicCategoryTree(id: string, parentId: string | null | undefined): Promise<void> {
  if (!parentId) return
  if (parentId === id) {
    throw new CategoryValidationError(["une catégorie ne peut pas être sa propre parente"])
  }
  let cursor: string | null = parentId
  while (cursor) {
    if (cursor === id) {
      throw new CategoryValidationError([
        "une catégorie ne peut pas être déplacée sous l'une de ses propres descendantes",
      ])
    }
    const parent: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    })
    if (!parent) throw new CategoryValidationError(["catégorie parente inconnue"])
    cursor = parent.parentId
  }
}

async function readIndexableCategoryProducts(categoryId: string): Promise<IndexableProduct[]> {
  const products = await prisma.product.findMany({
    where: { categoryId },
    include: { variants: true, category: true },
  })
  return products.map(toIndexableProduct)
}

export async function createCategory(input: CategoryInput, effects: StructureEffects) {
  const data = parseCategoryInput(input)
  await assertUniqueCategorySlug(data.slug)
  await assertCategoryParent(data.parentId)

  let category
  try {
    category = await prisma.category.create({
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

  effects.revalidateCategories()
  return category
}

export async function updateCategory(id: string, input: CategoryInput, effects: StructureEffects) {
  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) throw new CategoryNotFoundError()

  const data = parseCategoryInput(input)
  await assertUniqueCategorySlug(data.slug, id)
  await assertAcyclicCategoryTree(id, data.parentId)

  let category
  try {
    category = await prisma.category.update({
      where: { id },
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

  await deleteR2ObjectIfChanged(existing.image, data.image ?? null)
  const products = await readIndexableCategoryProducts(id)
  if (products.length > 0) await effects.reindexProducts(products)
  effects.revalidateCategories()
  return category
}

export async function deleteCategory(
  id: string,
  effects: StructureEffects,
  options: { reassignToCategoryId?: string } = {}
): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      children: { select: { id: true } },
      products: { select: { id: true } },
    },
  })
  if (!category) throw new CategoryNotFoundError()

  if (category.children.length > 0) throw new CategoryHasChildrenError()

  const reassignToCategoryId = options.reassignToCategoryId
  if (reassignToCategoryId) {
    if (reassignToCategoryId === id) {
      throw new CategoryValidationError([
        "une catégorie ne peut pas être réassignée vers elle-même",
      ])
    }
    await assertCategoryParent(reassignToCategoryId)
    if (category.products.length > 0) {
      await prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: reassignToCategoryId },
      })
      const movedProducts = await prisma.product.findMany({
        where: { id: { in: category.products.map((product) => product.id) } },
        include: { variants: true, category: true },
      })
      await effects.reindexProducts(movedProducts.map(toIndexableProduct))
    }
  } else if (category.products.length > 0) {
    throw new CategoryHasProductsError(category.products.length)
  }

  await prisma.category.delete({ where: { id } })
  await deleteR2ObjectIfChanged(category.image, null)
  effects.revalidateCategories()
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
