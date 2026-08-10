import { z } from "zod"

import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"

export interface CategoryInput {
  name: string
  slug: string
  parentId?: string | null
  image?: string | null
}

export interface CityInput {
  name: string
  fee: number
}

export interface StructureEffects {
  reindexCategoryProducts(categoryId: string): Promise<void>
  revalidateCategories(): void
  revalidateShipping(): void
}

export class CategoryValidationError extends Error {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "CategoryValidationError"
  }
}

export class CategorySlugConflictError extends Error {
  constructor() {
    super("Une catégorie avec ce slug existe déjà")
    this.name = "CategorySlugConflictError"
  }
}

export class CategoryNotFoundError extends Error {
  constructor() {
    super("Catégorie introuvable")
    this.name = "CategoryNotFoundError"
  }
}

export class CategoryHasChildrenError extends Error {
  constructor() {
    super("Impossible de supprimer : la catégorie contient des sous-catégories")
    this.name = "CategoryHasChildrenError"
  }
}

export class CategoryHasProductsError extends Error {
  constructor(productCount: number) {
    super(
      `Impossible de supprimer : ${productCount} produit${productCount > 1 ? "s" : ""} lui est/sont rattaché(s)`
    )
    this.name = "CategoryHasProductsError"
  }
}

export class CityValidationError extends Error {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "CityValidationError"
  }
}

export class CityNameConflictError extends Error {
  constructor() {
    super("Une ville avec ce nom existe déjà")
    this.name = "CityNameConflictError"
  }
}

export class CityNotFoundError extends Error {
  constructor() {
    super("Ville introuvable")
    this.name = "CityNotFoundError"
  }
}

export class ShippingValidationError extends Error {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "ShippingValidationError"
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

const cityInputSchema = z.object({
  name: z.string().trim().min(1, "nom requis"),
  fee: z.number().int().min(0, "le frais de livraison doit être positif ou nul"),
})

const shippingInputSchema = z.object({
  freeShippingThreshold: z.number().int().min(1, "le seuil de livraison offerte doit être positif"),
})

function parseCategoryInput(input: CategoryInput): CategoryInput {
  const result = categoryInputSchema.safeParse(input)
  if (!result.success) {
    throw new CategoryValidationError(result.error.issues.map((issue) => issue.message))
  }
  return result.data
}

function parseCityInput(input: CityInput): CityInput {
  const result = cityInputSchema.safeParse(input)
  if (!result.success) {
    throw new CityValidationError(result.error.issues.map((issue) => issue.message))
  }
  return result.data
}

function uniqueViolationFields(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return []
  const meta = error.meta as Record<string, unknown> | undefined
  if (Array.isArray(meta?.target)) return meta.target as string[]
  const driverError = meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: string[] } } }
    | undefined
  return driverError?.cause?.constraint?.fields ?? []
}

function isUniqueViolation(error: unknown, fields: string[]): boolean {
  return uniqueViolationFields(error).some((target) => fields.includes(target))
}

function mapCategoryUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error, ["slug"])) throw new CategorySlugConflictError()
  throw error
}

function mapCityUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error, ["name"])) throw new CityNameConflictError()
  throw error
}

async function assertUniqueCategorySlug(slug: string, excludeCategoryId?: string): Promise<void> {
  const existing = await prisma.category.findUnique({ where: { slug } })
  if (existing && existing.id !== excludeCategoryId) throw new CategorySlugConflictError()
}

async function assertUniqueCityName(name: string, excludeCityId?: string): Promise<void> {
  const existing = await prisma.deliveryCity.findUnique({ where: { name } })
  if (existing && existing.id !== excludeCityId) throw new CityNameConflictError()
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

  await effects.reindexCategoryProducts(id)
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
      await effects.reindexCategoryProducts(reassignToCategoryId)
    }
  } else if (category.products.length > 0) {
    throw new CategoryHasProductsError(category.products.length)
  }

  await prisma.category.delete({ where: { id } })
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

export async function createCity(input: CityInput, effects: StructureEffects) {
  const data = parseCityInput(input)
  await assertUniqueCityName(data.name)

  let city
  try {
    city = await prisma.deliveryCity.create({ data })
  } catch (error) {
    mapCityUniqueViolation(error)
  }

  effects.revalidateShipping()
  return city
}

export async function updateCity(id: string, input: CityInput, effects: StructureEffects) {
  const existing = await prisma.deliveryCity.findUnique({ where: { id } })
  if (!existing) throw new CityNotFoundError()

  const data = parseCityInput(input)
  await assertUniqueCityName(data.name, id)

  let city
  try {
    city = await prisma.deliveryCity.update({ where: { id }, data })
  } catch (error) {
    mapCityUniqueViolation(error)
  }

  effects.revalidateShipping()
  return city
}

export async function deleteCity(id: string, effects: StructureEffects): Promise<void> {
  const existing = await prisma.deliveryCity.findUnique({ where: { id } })
  if (!existing) throw new CityNotFoundError()

  await prisma.deliveryCity.delete({ where: { id } })
  effects.revalidateShipping()
}

export function listAdminCities() {
  return prisma.deliveryCity.findMany({ orderBy: { name: "asc" } })
}

export function getShippingSettings() {
  return prisma.shippingSettings.findUnique({ where: { id: "default" } })
}

export async function updateShippingSettings(
  input: { freeShippingThreshold: number },
  effects: StructureEffects
) {
  const result = shippingInputSchema.safeParse(input)
  if (!result.success) {
    throw new ShippingValidationError(result.error.issues.map((issue) => issue.message))
  }

  const settings = await prisma.shippingSettings.upsert({
    where: { id: "default" },
    update: { freeShippingThreshold: result.data.freeShippingThreshold },
    create: { id: "default", freeShippingThreshold: result.data.freeShippingThreshold },
  })

  effects.revalidateShipping()
  return settings
}
