import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"

// L'image d'une catégorie est une URL libre, hors du préfixe `products/` : elle
// ne passe que par l'opération de stockage réservée aux catégories. Ce mock
// court-circuite l'adaptateur pour éprouver l'effet best-effort de la
// Structure, qui doit journaliser une panne sans faire échouer la mutation.
// L'effet par défaut est éprouvé sans court-circuit dans
// `admin-structure-image-stockage.test.ts`.
const sendMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/r2", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/r2")>()
  return {
    ...original,
    stockageImageProduitR2: {
      ...original.stockageImageProduitR2,
      supprimerImageCategorie: () => sendMock(),
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

/**
 * Ce qu'un effet observe de la base au moment précis où il s'exécute : relevé
 * à l'intérieur du callback, asserté à l'extérieur, car `runEffect` avale les
 * erreurs d'un effet — un `expect` jeté dans le callback ne ferait pas
 * échouer le test.
 */
interface ReleveEffet {
  effet: string
  structureSourcePresente: boolean
  categorieDuProduit: string | null
}

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

  it("ne déclenche les effets de la suppression qu'après le commit, dans leur ordre", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-post-commit") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-post-commit-cible") })
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit engagé",
        slug: productSlug("post-commit"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
      },
    })

    // Chaque effet relève l'état de la base par une connexion distincte de la
    // transaction : elle ne voit que des faits committés. Si un effet tournait
    // avant le commit, la Structure source existerait encore et le relevé le
    // dirait. L'assertion vit donc dans le callback — c'est lui qui prouve
    // l'ordre — mais son résultat est aussi relevé puis asserté à l'extérieur,
    // car `runEffect` avale les erreurs d'un effet.
    const releves: ReleveEffet[] = []
    const relever = async (effet: string) => {
      const source = await prisma.category.findUnique({
        where: { id: category.id },
      })
      const deplace = await prisma.product.findUnique({
        where: { id: product.id },
      })
      expect(source).toBeNull()
      expect(deplace).toMatchObject({ categoryId: target.id })
      releves.push({
        effet,
        structureSourcePresente: source !== null,
        categorieDuProduit: deplace?.categoryId ?? null,
      })
    }
    const reindexProducts = vi.fn(async () => {
      await relever("réindexation")
    })
    const deleteImage = vi.fn(async () => {
      await relever("image")
    })
    const revalidateCategories = vi.fn(async () => {
      await relever("invalidation")
    })

    await deleteCategory(
      category.id,
      { reindexProducts, deleteImage, revalidateCategories },
      { reassignToCategoryId: target.id }
    )

    // Trois relevés identiques et dans l'ordre de la séquence : la Structure
    // source est déjà supprimée et le Produit déjà réaffecté quand le premier
    // effet part (ADR-0014).
    expect(releves).toEqual([
      {
        effet: "réindexation",
        structureSourcePresente: false,
        categorieDuProduit: target.id,
      },
      {
        effet: "image",
        structureSourcePresente: false,
        categorieDuProduit: target.id,
      },
      {
        effet: "invalidation",
        structureSourcePresente: false,
        categorieDuProduit: target.id,
      },
    ])
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: product.id,
        categorySlug: target.slug,
        categoryName: target.name,
      }),
    ])
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/cat.jpg")
  })

  it("annule toute la réaffectation quand la suppression finale tombe sur la contrainte réelle", async () => {
    const reindexProducts = vi.fn()
    const revalidateCategories = vi.fn()
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-rollback") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-rollback-cible") })
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit réaffecté",
        slug: productSlug("rollback"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
      },
    })

    // Une transaction tierce insère un Produit fantôme sur la Structure
    // source et retient son commit : cette insertion non committée tient un
    // verrou `FOR KEY SHARE` sur la Structure source, que la suppression
    // finale devra attendre.
    let liberer = () => {}
    const retention = new Promise<void>((resolve) => {
      liberer = resolve
    })
    const insertion = prisma.$transaction(
      async (tx) => {
        await tx.product.create({
          data: {
            name: "Produit fantôme",
            slug: productSlug("fantome"),
            description: "desc",
            brand: "Marque",
            price: 10000,
            specs: {},
            images: [],
            categoryId: category.id,
          },
        })
        await retention
      },
      { timeout: 30_000 }
    )
    insertion.catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Lancée sans l'attendre : la réaffectation part, puis la suppression
    // finale se bloque sur le verrou de clé étrangère de la transaction tierce.
    const suppression = deleteCategory(
      category.id,
      { reindexProducts, revalidateCategories, deleteImage },
      { reassignToCategoryId: target.id }
    )
    suppression.catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 400))
    // La transaction tierce commit : le Produit fantôme rend la suppression
    // finale invalide pour `ON DELETE RESTRICT`, qui rétracte la mutation
    // entière — réaffectation comprise.
    liberer()

    const refus: unknown = await suppression.then(
      () => undefined,
      (error: unknown) => error
    )
    expect(refus).toBeInstanceOf(Error)
    expect((refus as Error).message).toMatch(
      /violates RESTRICT setting of foreign key constraint/
    )
    await insertion

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    await expect(
      prisma.product.findUnique({ where: { slug: productSlug("fantome") } })
    ).resolves.not.toBeNull()
    expect(reindexProducts).not.toHaveBeenCalled()
    expect(revalidateCategories).not.toHaveBeenCalled()
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it("journalise une panne de réindexation sans rejeter la suppression committée", async () => {
    const deleteImage = vi.fn()
    const revalidateCategories = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-reindex-panne") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-reindex-panne-cible") })
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit indexé ailleurs",
        slug: productSlug("reindex-panne"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
      },
    })

    await verifierFrontiereBestEffort("réindexation", (effetQuiEchoue) =>
      deleteCategory(
        category.id,
        { reindexProducts: effetQuiEchoue, deleteImage, revalidateCategories },
        { reassignToCategoryId: target.id }
      )
    )

    // La mutation committée fait foi : elle survit à la panne de l'effet, et
    // les effets suivants de la séquence sont malgré tout partis.
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: target.id })
    expect(revalidateCategories).toHaveBeenCalledOnce()
  })

  it("journalise une panne de suppression d'image sans rejeter la suppression committée", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-img-panne") })
    )

    await verifierFrontiereBestEffort("suppression d'image", (effetQuiEchoue) =>
      deleteCategory(category.id, { deleteImage: effetQuiEchoue })
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
  })

  it("journalise une panne d'invalidation de cache sans rejeter la suppression committée", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-cache-panne"), image: null })
    )

    await verifierFrontiereBestEffort("invalidation", (effetQuiEchoue) =>
      deleteCategory(category.id, { revalidateCategories: effetQuiEchoue })
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
  })

  it("refuse la réaffectation vers la Structure supprimée elle-même, sans écriture ni effet", async () => {
    const reindexProducts = vi.fn()
    const revalidateCategories = vi.fn()
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-self-target") })
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit non déplacé",
        slug: productSlug("self-target"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
      },
    })

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(
        category.id,
        { reindexProducts, revalidateCategories, deleteImage },
        { reassignToCategoryId: category.id }
      )
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expect(reindexProducts).not.toHaveBeenCalled()
    expect(revalidateCategories).not.toHaveBeenCalled()
    expect(deleteImage).not.toHaveBeenCalled()
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
    const reindexProducts = vi.fn()
    const revalidateCategories = vi.fn()
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-bad-target") })
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit non déplacé",
        slug: productSlug("bad-target"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
      },
    })

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(
        category.id,
        { reindexProducts, revalidateCategories, deleteImage },
        { reassignToCategoryId: "unknown" }
      )
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expect(reindexProducts).not.toHaveBeenCalled()
    expect(revalidateCategories).not.toHaveBeenCalled()
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it("throws CategoryNotFoundError when deleting an unknown category", async () => {
    await expect(deleteCategory("unknown-id")).rejects.toThrow(
      CategoryNotFoundError
    )
  })
})
