import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import {
  CategoryHasChildrenError,
  CategoryHasProductsError,
  CategoryNotFoundError,
  CategorySlugConflictError,
  CategoryValidationError,
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
  type StructureEffects,
} from "@/lib/use-cases/admin-structure"

const runId = randomUUID().slice(0, 8)
const categorySlug = (suffix: string) => `cat-${runId}-${suffix}`
const productSlug = (suffix: string) => `struc-${runId}-${suffix}`

function makeEffects(): StructureEffects & {
  reindexCategoryProducts: ReturnType<typeof vi.fn>
} {
  return {
    reindexCategoryProducts: vi.fn(async () => {}),
    revalidateCategories: vi.fn(),
  }
}

function makeCategoryInput(overrides: Partial<CategoryInput> = {}): CategoryInput {
  return {
    name: "Catégorie Test T3",
    slug: categorySlug("base"),
    image: "https://example.com/cat.jpg",
    ...overrides,
  }
}

describe("admin structure mutations — categories", () => {
  beforeEach(async () => {
    await prisma.product.deleteMany({ where: { slug: { startsWith: `struc-${runId}-` } } })
    await prisma.category.deleteMany({ where: { slug: { startsWith: `cat-${runId}-` } } })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { slug: { startsWith: `struc-${runId}-` } } })
    await prisma.category.deleteMany({ where: { slug: { startsWith: `cat-${runId}-` } } })
    await prisma.$disconnect()
  })

  it("creates a root category and revalidates the structure", async () => {
    const effects = makeEffects()

    const category = await createCategory(makeCategoryInput(), effects)

    expect(category.id).toBeTruthy()
    expect(category.name).toBe("Catégorie Test T3")
    expect(category.parentId).toBeNull()
    const persisted = await prisma.category.findUniqueOrThrow({ where: { id: category.id } })
    expect(persisted.image).toBe("https://example.com/cat.jpg")
    expect(effects.revalidateCategories).toHaveBeenCalledOnce()
    expect(effects.reindexCategoryProducts).not.toHaveBeenCalled()
  })

  it("creates a nested category under an existing parent", async () => {
    const parent = await createCategory(makeCategoryInput({ slug: categorySlug("parent") }), makeEffects())

    const child = await createCategory(
      makeCategoryInput({ slug: categorySlug("child"), parentId: parent.id }),
      makeEffects()
    )

    expect(child.parentId).toBe(parent.id)
    const persisted = await prisma.category.findUniqueOrThrow({
      where: { id: child.id },
      include: { parent: true },
    })
    expect(persisted.parent?.name).toBe("Catégorie Test T3")
  })

  it("rejects a duplicate category slug and persists nothing", async () => {
    const effects = makeEffects()
    await createCategory(makeCategoryInput({ slug: categorySlug("dup") }), effects)

    await expect(
      createCategory(makeCategoryInput({ slug: categorySlug("dup"), name: "Autre" }), makeEffects())
    ).rejects.toThrow(CategorySlugConflictError)

    const count = await prisma.category.count({ where: { slug: categorySlug("dup") } })
    expect(count).toBe(1)
  })

  it("rejects an invalid slug format", async () => {
    await expect(
      createCategory(makeCategoryInput({ slug: "Slug Invalide!" }), makeEffects())
    ).rejects.toThrow(CategoryValidationError)
  })

  it("rejects an empty name", async () => {
    await expect(
      createCategory(makeCategoryInput({ name: " " }), makeEffects())
    ).rejects.toThrow(CategoryValidationError)
  })

  it("rejects an unknown parent", async () => {
    await expect(
      createCategory(makeCategoryInput({ parentId: "unknown-parent" }), makeEffects())
    ).rejects.toThrow(CategoryValidationError)
  })

  it("updates a category, re-indexes its products and revalidates", async () => {
    const effects = makeEffects()
    const parent = await createCategory(makeCategoryInput({ slug: categorySlug("up-parent") }), makeEffects())
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("update"), name: "Avant" }),
      makeEffects()
    )

    const updated = await updateCategory(
      category.id,
      makeCategoryInput({ slug: categorySlug("update"), name: "Après", parentId: parent.id, image: null }),
      effects
    )

    expect(updated.name).toBe("Après")
    expect(updated.parentId).toBe(parent.id)
    expect(updated.image).toBeNull()
    expect(effects.reindexCategoryProducts).toHaveBeenCalledWith(category.id)
    expect(effects.revalidateCategories).toHaveBeenCalled()
  })

  it("accepts an unchanged slug on update", async () => {
    const effects = makeEffects()
    const category = await createCategory(makeCategoryInput({ slug: categorySlug("self") }), effects)

    await expect(
      updateCategory(
        category.id,
        makeCategoryInput({ slug: categorySlug("self"), name: "Renommé" }),
        makeEffects()
      )
    ).resolves.toMatchObject({ slug: categorySlug("self") })
  })

  it("rejects updating a category to another category's slug", async () => {
    const effects = makeEffects()
    const first = await createCategory(makeCategoryInput({ slug: categorySlug("slug-a") }), effects)
    await createCategory(makeCategoryInput({ slug: categorySlug("slug-b") }), makeEffects())

    await expect(
      updateCategory(
        first.id,
        makeCategoryInput({ slug: categorySlug("slug-b") }),
        makeEffects()
      )
    ).rejects.toThrow(CategorySlugConflictError)
  })

  it("rejects making a category its own parent", async () => {
    const category = await createCategory(makeCategoryInput({ slug: categorySlug("cycle-self") }), makeEffects())

    await expect(
      updateCategory(
        category.id,
        makeCategoryInput({ slug: categorySlug("cycle-self"), parentId: category.id }),
        makeEffects()
      )
    ).rejects.toThrow(CategoryValidationError)
  })

  it("rejects moving a category under one of its own descendants", async () => {
    const parent = await createCategory(makeCategoryInput({ slug: categorySlug("cyc-a") }), makeEffects())
    const child = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-b"), parentId: parent.id }),
      makeEffects()
    )
    const grandchild = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-c"), parentId: child.id }),
      makeEffects()
    )

    await expect(
      updateCategory(
        parent.id,
        makeCategoryInput({ slug: categorySlug("cyc-a"), parentId: grandchild.id }),
        makeEffects()
      )
    ).rejects.toThrow(CategoryValidationError)
  })

  it("throws CategoryNotFoundError when updating an unknown category", async () => {
    await expect(
      updateCategory("unknown-id", makeCategoryInput(), makeEffects())
    ).rejects.toThrow(CategoryNotFoundError)
  })

  it("deletes an empty category and revalidates", async () => {
    const effects = makeEffects()
    const category = await createCategory(makeCategoryInput({ slug: categorySlug("delete-empty") }), effects)

    await deleteCategory(category.id, effects)

    await expect(prisma.category.findUnique({ where: { id: category.id } })).resolves.toBeNull()
    expect(effects.revalidateCategories).toHaveBeenCalled()
    expect(effects.reindexCategoryProducts).not.toHaveBeenCalled()
  })

  it("blocks deletion of a category that still has children", async () => {
    const parent = await createCategory(makeCategoryInput({ slug: categorySlug("del-parent") }), makeEffects())
    await createCategory(
      makeCategoryInput({ slug: categorySlug("del-child"), parentId: parent.id }),
      makeEffects()
    )

    await expect(deleteCategory(parent.id, makeEffects())).rejects.toThrow(CategoryHasChildrenError)

    await expect(prisma.category.findUnique({ where: { id: parent.id } })).resolves.not.toBeNull()
  })

  it("blocks deletion of a category that still has products", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-prods") }),
      makeEffects()
    )
    await prisma.product.create({
      data: {
        name: "Produit bloqué",
        slug: productSlug("blocked"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
      },
    })

    const promise = deleteCategory(category.id, makeEffects())
    await expect(promise).rejects.toThrow(CategoryHasProductsError)
    await expect(prisma.category.findUnique({ where: { id: category.id } })).resolves.not.toBeNull()
  })

  it("reassigns products to a target category when deleting", async () => {
    const effects = makeEffects()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-reassign") }),
      makeEffects()
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-target") }),
      makeEffects()
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit déplacé",
        slug: productSlug("moved"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
      },
    })

    await deleteCategory(category.id, effects, { reassignToCategoryId: target.id })

    await expect(prisma.category.findUnique({ where: { id: category.id } })).resolves.toBeNull()
    const moved = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(moved.categoryId).toBe(target.id)
    expect(effects.reindexCategoryProducts).toHaveBeenCalledWith(target.id)
    expect(effects.revalidateCategories).toHaveBeenCalled()
  })

  it("rejects reassigning products to an unknown target", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-bad-target") }),
      makeEffects()
    )

    await expect(
      deleteCategory(category.id, makeEffects(), { reassignToCategoryId: "unknown" })
    ).rejects.toThrow(CategoryValidationError)
  })

  it("throws CategoryNotFoundError when deleting an unknown category", async () => {
    await expect(deleteCategory("unknown-id", makeEffects())).rejects.toThrow(CategoryNotFoundError)
  })
})
