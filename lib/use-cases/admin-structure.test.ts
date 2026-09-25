import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"

// L'image d'une catégorie est une URL libre, hors du préfixe `products/` : elle
// est rejetée par la garde d'espace de noms du stockage image produit. Ce mock
// court-circuite donc l'adaptateur pour éprouver l'effet best-effort de la
// Structure, qui doit journaliser une panne sans faire échouer la mutation.
const sendMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/r2", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/r2")>()
  return {
    ...original,
    stockageImageProduitR2: {
      ...original.stockageImageProduitR2,
      supprimerImagePersistee: () => sendMock(),
    },
  }
})

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
} from "@/lib/use-cases/admin-structure"
import {
  verifierFrontiereBestEffort,
  verifierRefusValidation,
} from "@/test/mutation-squelette-recette"

const runId = randomUUID().slice(0, 8)
const categorySlug = (suffix: string) => `cat-${runId}-${suffix}`
const productSlug = (suffix: string) => `struc-${runId}-${suffix}`

function makeCategoryInput(
  overrides: Partial<CategoryInput> = {}
): CategoryInput {
  return {
    name: "Catégorie Test T3",
    slug: categorySlug("base"),
    image: "https://example.com/cat.jpg",
    ...overrides,
  }
}

describe("admin structure mutations — categories", () => {
  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `struc-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `struc-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-${runId}-` } },
    })
    await prisma.$disconnect()
  })

  it("creates a root category and revalidates the structure", async () => {
    const revalidateCategories = vi.fn()
    const reindexProducts = vi.fn()

    const category = await createCategory(makeCategoryInput(), {
      revalidateCategories,
      reindexProducts,
    })

    expect(category.id).toBeTruthy()
    expect(category.name).toBe("Catégorie Test T3")
    expect(category.parentId).toBeNull()
    const persisted = await prisma.category.findUniqueOrThrow({
      where: { id: category.id },
    })
    expect(persisted.image).toBe("https://example.com/cat.jpg")
    expect(revalidateCategories).toHaveBeenCalledOnce()
    expect(reindexProducts).not.toHaveBeenCalled()
  })

  it("creates a nested category under an existing parent", async () => {
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("parent") })
    )

    const child = await createCategory(
      makeCategoryInput({ slug: categorySlug("child"), parentId: parent.id })
    )

    expect(child.parentId).toBe(parent.id)
    const persisted = await prisma.category.findUniqueOrThrow({
      where: { id: child.id },
      include: { parent: true },
    })
    expect(persisted.parent?.name).toBe("Catégorie Test T3")
  })

  it("rejects a duplicate category slug and persists nothing", async () => {
    await createCategory(makeCategoryInput({ slug: categorySlug("dup") }))

    await expect(
      createCategory(
        makeCategoryInput({ slug: categorySlug("dup"), name: "Autre" })
      )
    ).rejects.toThrow(CategorySlugConflictError)

    const count = await prisma.category.count({
      where: { slug: categorySlug("dup") },
    })
    expect(count).toBe(1)
  })

  it("rejects an invalid slug format", async () => {
    await verifierRefusValidation(CategoryValidationError, () =>
      createCategory(makeCategoryInput({ slug: "Slug Invalide!" }))
    )
  })

  it("rejects an empty name", async () => {
    await verifierRefusValidation(CategoryValidationError, () =>
      createCategory(makeCategoryInput({ name: " " }))
    )
  })

  it("rejects an unknown parent", async () => {
    await verifierRefusValidation(CategoryValidationError, () =>
      createCategory(makeCategoryInput({ parentId: "unknown-parent" }))
    )
  })

  it("updates a category and revalidates; an empty category is not re-indexed", async () => {
    const revalidateCategories = vi.fn()
    const reindexProducts = vi.fn()
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("update-parent") })
    )
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("update-empty") })
    )

    const updated = await updateCategory(
      category.id,
      makeCategoryInput({
        slug: categorySlug("update-empty"),
        name: "Après",
        parentId: parent.id,
        image: null,
      }),
      { revalidateCategories, reindexProducts }
    )

    expect(updated.name).toBe("Après")
    expect(updated.parentId).toBe(parent.id)
    expect(updated.image).toBeNull()
    expect(revalidateCategories).toHaveBeenCalled()
    expect(reindexProducts).not.toHaveBeenCalled()
  })

  it("deletes the previous image through effects when it is replaced on update", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({
        slug: categorySlug("img-replace"),
        image: "https://example.com/old-cat.jpg",
      })
    )

    await updateCategory(
      category.id,
      makeCategoryInput({
        slug: categorySlug("img-replace"),
        image: "https://example.com/new-cat.jpg",
      }),
      { deleteImage }
    )

    expect(deleteImage).toHaveBeenCalledOnce()
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/old-cat.jpg")
  })

  it("does not delete any image when it is unchanged on update", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("img-same") })
    )

    await updateCategory(
      category.id,
      makeCategoryInput({ slug: categorySlug("img-same") }),
      { deleteImage }
    )

    expect(deleteImage).not.toHaveBeenCalled()
  })

  it("deletes the previous image when it is removed on update", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("img-remove") })
    )

    await updateCategory(
      category.id,
      makeCategoryInput({ slug: categorySlug("img-remove"), image: null }),
      { deleteImage }
    )

    expect(deleteImage).toHaveBeenCalledOnce()
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/cat.jpg")
  })

  it("journalise une panne R2 sur l'image de catégorie sans faire échouer l'update", async () => {
    // L'effet par défaut doit rester visible : une panne R2 ne doit ni faire
    // échouer une mutation Structure engagée, ni disparaître en silence.
    sendMock.mockRejectedValueOnce(new Error("secret AWS failure"))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("img-panne") })
    )

    try {
      const updated = await updateCategory(
        category.id,
        makeCategoryInput({
          slug: categorySlug("img-panne"),
          image: "https://example.com/remplacement.jpg",
        })
      )

      expect(updated.image).toBe("https://example.com/remplacement.jpg")
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/cat.jpg"),
        expect.anything()
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("updates a category name and re-indexes the documents of its products", async () => {
    const reindexProducts = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("update"), name: "Avant" })
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit reindexé",
        slug: productSlug("update"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
        variants: {
          create: {
            name: "Standard",
            sku: `STRUC-${runId}-update`,
            priceDelta: 0,
            stock: 5,
          },
        },
      },
    })

    await updateCategory(
      category.id,
      makeCategoryInput({ slug: categorySlug("update"), name: "Après" }),
      { reindexProducts }
    )

    expect(reindexProducts).toHaveBeenCalledOnce()
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: product.id,
        name: "Produit reindexé",
        totalStock: 5,
        categorySlug: categorySlug("update"),
        categoryName: "Après",
      }),
    ])
  })

  it("accepts an unchanged slug on update", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("self") })
    )

    await expect(
      updateCategory(
        category.id,
        makeCategoryInput({ slug: categorySlug("self"), name: "Renommé" })
      )
    ).resolves.toMatchObject({ slug: categorySlug("self") })
  })

  it("rejects updating a category to another category's slug", async () => {
    const first = await createCategory(
      makeCategoryInput({ slug: categorySlug("slug-a") })
    )
    await createCategory(makeCategoryInput({ slug: categorySlug("slug-b") }))

    await expect(
      updateCategory(
        first.id,
        makeCategoryInput({ slug: categorySlug("slug-b") })
      )
    ).rejects.toThrow(CategorySlugConflictError)
  })

  it("rejects making a category its own parent", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("cycle-self") })
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      updateCategory(
        category.id,
        makeCategoryInput({
          slug: categorySlug("cycle-self"),
          parentId: category.id,
        })
      )
    )
  })

  it("rejects moving a category under one of its own descendants", async () => {
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-a") })
    )
    const child = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-b"), parentId: parent.id })
    )
    const grandchild = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-c"), parentId: child.id })
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      updateCategory(
        parent.id,
        makeCategoryInput({
          slug: categorySlug("cyc-a"),
          parentId: grandchild.id,
        })
      )
    )
  })

  it("throws CategoryNotFoundError when updating an unknown category", async () => {
    await expect(
      updateCategory("unknown-id", makeCategoryInput())
    ).rejects.toThrow(CategoryNotFoundError)
  })

  it("deletes an empty category and revalidates", async () => {
    const revalidateCategories = vi.fn()
    const reindexProducts = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("delete-empty") })
    )

    await deleteCategory(category.id, {
      revalidateCategories,
      reindexProducts,
    })

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    expect(revalidateCategories).toHaveBeenCalled()
    expect(reindexProducts).not.toHaveBeenCalled()
  })

  it("deletes the category image through effects when present", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-img") })
    )

    await deleteCategory(category.id, { deleteImage })

    expect(deleteImage).toHaveBeenCalledOnce()
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/cat.jpg")
  })

  it("does not delete any image when the deleted category has none", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-no-img"), image: null })
    )

    await deleteCategory(category.id, { deleteImage })

    expect(deleteImage).not.toHaveBeenCalled()
  })

  it("blocks deletion of a category that still has children", async () => {
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-parent") })
    )
    await createCategory(
      makeCategoryInput({
        slug: categorySlug("del-child"),
        parentId: parent.id,
      })
    )

    await expect(deleteCategory(parent.id)).rejects.toThrow(
      CategoryHasChildrenError
    )

    await expect(
      prisma.category.findUnique({ where: { id: parent.id } })
    ).resolves.not.toBeNull()
  })

  it("blocks deletion of a category that still has products", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-prods") })
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

    const promise = deleteCategory(category.id)
    await expect(promise).rejects.toThrow(CategoryHasProductsError)
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
  })

  it("reassigns products to a target category when deleting", async () => {
    const reindexProducts = vi.fn()
    const revalidateCategories = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-reassign") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-target") })
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

    await deleteCategory(
      category.id,
      { reindexProducts, revalidateCategories },
      { reassignToCategoryId: target.id }
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    const moved = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(moved.categoryId).toBe(target.id)
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: product.id,
        categorySlug: target.slug,
        categoryName: target.name,
      }),
    ])
    expect(revalidateCategories).toHaveBeenCalled()
  })

  it("still persists the mutation when revalidation throws", async () => {
    const category = await verifierFrontiereBestEffort(
      "invalidation",
      (effetQuiEchoue) =>
        createCategory(
          makeCategoryInput({ slug: categorySlug("fail-cache") }),
          {
            revalidateCategories: effetQuiEchoue,
          }
        )
    )

    expect(category.name).toBe("Catégorie Test T3")
  })

  it("rejects reassigning products to an unknown target", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-bad-target") })
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(category.id, undefined, {
        reassignToCategoryId: "unknown",
      })
    )
  })

  it("throws CategoryNotFoundError when deleting an unknown category", async () => {
    await expect(deleteCategory("unknown-id")).rejects.toThrow(
      CategoryNotFoundError
    )
  })
})
