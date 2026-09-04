import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
import {
  CatalogValidationError,
  createProduct,
  deleteProduct,
  DuplicateSkuError,
  ProductNotFoundError,
  SlugConflictError,
  updateProduct,
  updateVariantStock,
  VariantNotFoundError,
  type CatalogEffects,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"

const runId = randomUUID().slice(0, 8)
const slug = (suffix: string) => `p-${runId}-${suffix}`

function makeEffects(): CatalogEffects & {
  reindexProducts: ReturnType<typeof vi.fn>
  deleteImages: ReturnType<typeof vi.fn>
} {
  return {
    reindexProducts: vi.fn(async () => {}),
    removeProductFromIndex: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    deleteImages: vi.fn(async () => {}),
  }
}

function makeInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Test Product",
    slug: slug("base"),
    description: "Une description de test",
    brand: "Marque Test",
    categoryId,
    price: 100000,
    specs: { Écran: "6 pouces" },
    images: ["https://example.com/img.jpg"],
    isFeatured: false,
    featuredOrder: 0,
    freeShipping: false,
    variants: [
      { name: "Standard", sku: `SKU-${runId}-1`, priceDelta: 0, stock: 5 },
    ],
    ...overrides,
  }
}

let categoryId: string

describe("admin catalog mutations", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: "Catégorie Test T2", slug: `categorie-${runId}` },
    })
    categoryId = category.id
  })

  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `p-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `p-${runId}-` } },
    })
    await prisma.category.deleteMany({ where: { slug: `categorie-${runId}` } })
    await prisma.$disconnect()
  })

  it("creates a product with its variants and returns it", async () => {
    const input = makeInput({
      variants: [
        { name: "128 Go", sku: `SKU-${runId}-a`, priceDelta: 0, stock: 10 },
        { name: "256 Go", sku: `SKU-${runId}-b`, priceDelta: 150000, stock: 3 },
      ],
    })

    const product = await createProduct(input)

    expect(product.id).toBeTruthy()
    expect(product.slug).toBe(input.slug)
    expect(product.price).toBe(100000)
    expect(product.variants).toHaveLength(2)

    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: true },
    })
    expect(persisted.name).toBe("Test Product")
    expect(persisted.variants.map((v) => v.sku).sort()).toEqual(
      [`SKU-${runId}-a`, `SKU-${runId}-b`].sort()
    )
  })

  it("triggers a Meilisearch re-index and cache revalidation after creating", async () => {
    const reindexProducts = vi.fn(async () => {})
    const revalidateCatalog = vi.fn()
    const product = await createProduct(makeInput({ slug: slug("reindex") }), {
      reindexProducts,
      revalidateCatalog,
    })

    expect(reindexProducts).toHaveBeenCalledOnce()
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: product.id,
        slug: product.slug,
        name: "Test Product",
        brand: "Marque Test",
        totalStock: 5,
        categoryId,
        categorySlug: `categorie-${runId}`,
        categoryName: "Catégorie Test T2",
        isFeatured: false,
      }),
    ])
    expect(revalidateCatalog).toHaveBeenCalledWith({
      id: product.id,
      slug: product.slug,
    })
  })

  it("rejects a duplicate slug and persists nothing", async () => {
    await createProduct(makeInput({ slug: slug("dup-slug") }))

    await expect(
      createProduct(
        makeInput({ slug: slug("dup-slug"), name: "Autre produit" })
      )
    ).rejects.toThrow(SlugConflictError)

    const count = await prisma.product.count({
      where: { slug: slug("dup-slug") },
    })
    expect(count).toBe(1)
  })

  it("rejects duplicate SKUs inside the same product", async () => {
    await expect(
      createProduct(
        makeInput({
          variants: [
            { name: "A", sku: "SKU-DUPE", priceDelta: 0, stock: 1 },
            { name: "B", sku: "SKU-DUPE", priceDelta: 0, stock: 1 },
          ],
        })
      )
    ).rejects.toThrow(DuplicateSkuError)
  })

  it("rejects a SKU already used by another product", async () => {
    const sharedSku = `SKU-${runId}-shared`
    await createProduct(
      makeInput({
        variants: [{ name: "A", sku: sharedSku, priceDelta: 0, stock: 1 }],
      })
    )

    await expect(
      createProduct(
        makeInput({
          slug: slug("sku-conflict"),
          variants: [{ name: "A", sku: sharedSku, priceDelta: 0, stock: 1 }],
        })
      )
    ).rejects.toThrow(DuplicateSkuError)
  })

  it("rejects a negative product price", async () => {
    await expect(
      createProduct(makeInput({ price: -100 }))
    ).rejects.toThrow(CatalogValidationError)
  })

  it("rejects negative stock on a variant", async () => {
    await expect(
      createProduct(
        makeInput({
          variants: [
            { name: "A", sku: `SKU-${runId}-neg`, priceDelta: 0, stock: -2 },
          ],
        })
      )
    ).rejects.toThrow(CatalogValidationError)
  })

  it("rejects a variant whose final price (price + delta) is negative", async () => {
    await expect(
      createProduct(
        makeInput({
          variants: [
            {
              name: "A",
              sku: `SKU-${runId}-negprice`,
              priceDelta: -200000,
              stock: 1,
            },
          ],
        })
      )
    ).rejects.toThrow(CatalogValidationError)
  })

  it("updates product fields and reconciles variants (update, create, delete)", async () => {
    const product = await createProduct(
      makeInput({
        slug: slug("update"),
        variants: [
          { name: "128 Go", sku: `SKU-${runId}-u1`, priceDelta: 0, stock: 5 },
          {
            name: "256 Go",
            sku: `SKU-${runId}-u2`,
            priceDelta: 100000,
            stock: 3,
          },
        ],
      })
    )
    const kept = product.variants.find((v) => v.sku === `SKU-${runId}-u1`)!
    const removed = product.variants.find((v) => v.sku === `SKU-${runId}-u2`)!

    const input = makeInput({
      slug: slug("update"),
      name: "Produit renommé",
      price: 150000,
      variants: [
        {
          id: kept.id,
          name: kept.name,
          sku: kept.sku,
          priceDelta: 5000,
          stock: 9,
        },
        { name: "Nouveau", sku: `SKU-${runId}-u3`, priceDelta: 0, stock: 2 },
      ],
    })

    const updated = await updateProduct(product.id, input)

    expect(updated.name).toBe("Produit renommé")
    expect(updated.price).toBe(150000)
    expect(updated.variants).toHaveLength(2)
    expect(updated.variants.map((v) => v.sku)).toContain(`SKU-${runId}-u3`)
    expect(updated.variants.some((v) => v.id === removed.id)).toBe(false)
    expect(updated.variants.find((v) => v.id === kept.id)).toMatchObject({
      priceDelta: 5000,
      stock: 9,
    })
  })

  it("re-indexes the product after update when a search spy is provided", async () => {
    const product = await createProduct(makeInput({ slug: slug("update-idx") }))
    const kept = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const reindexProducts = vi.fn(async () => {})

    await updateProduct(
      product.id,
      makeInput({ slug: slug("update-idx"), name: "Produit renommé", variants: kept }),
      { reindexProducts }
    )

    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Produit renommé" }),
    ])
  })

  it("accepts an unchanged slug on update", async () => {
    const product = await createProduct(makeInput({ slug: slug("self-slug") }))
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))

    await expect(
      updateProduct(
        product.id,
        makeInput({ slug: slug("self-slug"), variants })
      )
    ).resolves.toMatchObject({ slug: slug("self-slug") })
  })

  it("rejects updating a product to another product's slug", async () => {
    const first = await createProduct(makeInput({ slug: slug("slug-a") }))
    await createProduct(
      makeInput({
        slug: slug("slug-b"),
        variants: [
          { name: "Standard", sku: `SKU-${runId}-b`, priceDelta: 0, stock: 5 },
        ],
      })
    )
    const variants = first.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))

    await expect(
      updateProduct(first.id, makeInput({ slug: slug("slug-b"), variants }))
    ).rejects.toThrow(SlugConflictError)
  })

  it("revalidates the previous slug when the product is renamed", async () => {
    const product = await createProduct(
      makeInput({ slug: slug("before-rename") })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const revalidateCatalog = vi.fn()

    await updateProduct(
      product.id,
      makeInput({ slug: slug("after-rename"), name: "Renommé", variants }),
      { revalidateCatalog }
    )

    expect(revalidateCatalog).toHaveBeenLastCalledWith({
      id: product.id,
      slug: slug("after-rename"),
      previousSlug: slug("before-rename"),
    })
  })

  it("passes exactly the removed images to deleteImages on update", async () => {
    const images = [
      "https://cdn.example.com/keep-1.jpg",
      "https://cdn.example.com/remove-1.jpg",
      "https://cdn.example.com/remove-2.jpg",
    ]
    const product = await createProduct(
      makeInput({ slug: slug("img-update"), images })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const deleteImages = vi.fn(async () => {})

    await updateProduct(
      product.id,
      makeInput({
        slug: slug("img-update"),
        images: [
          "https://cdn.example.com/keep-1.jpg",
          "https://cdn.example.com/new.jpg",
        ],
        variants,
      }),
      { deleteImages }
    )

    expect(deleteImages).toHaveBeenCalledOnce()
    expect(deleteImages).toHaveBeenCalledWith([
      "https://cdn.example.com/remove-1.jpg",
      "https://cdn.example.com/remove-2.jpg",
    ])
  })

  it("passes an empty diff to deleteImages when no image was removed on update", async () => {
    const product = await createProduct(makeInput({ slug: slug("img-same") }))
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const deleteImages = vi.fn(async () => {})

    await updateProduct(
      product.id,
      makeInput({ slug: slug("img-same"), variants }),
      { deleteImages }
    )

    expect(deleteImages).toHaveBeenCalledOnce()
    expect(deleteImages).toHaveBeenCalledWith([])
  })

  it("rejects updating with a variant id belonging to another product", async () => {
    const first = await createProduct(makeInput({ slug: slug("own-a") }))
    const second = await createProduct(
      makeInput({
        slug: slug("own-b"),
        variants: [
          {
            name: "Standard",
            sku: `SKU-${runId}-own`,
            priceDelta: 0,
            stock: 5,
          },
        ],
      })
    )
    const foreignVariant = second.variants[0]
    const variants = first.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    variants.push({
      id: foreignVariant.id,
      name: "Intrus",
      sku: `SKU-${runId}-intrus`,
      priceDelta: 0,
      stock: 1,
    })

    await expect(
      updateProduct(first.id, makeInput({ slug: slug("own-a"), variants }))
    ).rejects.toThrow(CatalogValidationError)

    const untouched = await prisma.productVariant.findUniqueOrThrow({
      where: { id: foreignVariant.id },
    })
    expect(untouched.name).toBe("Standard")
  })

  it("throws ProductNotFoundError when updating an unknown product", async () => {
    await expect(
      updateProduct("unknown-id", makeInput())
    ).rejects.toThrow(ProductNotFoundError)
  })

  it("deletes the product with its variants and clears the search index", async () => {
    const effects = makeEffects()
    const product = await createProduct(makeInput({ slug: slug("delete") }))

    await deleteProduct(product.id, effects)

    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toBeNull()
    const variantCount = await prisma.productVariant.count({
      where: { productId: product.id },
    })
    expect(variantCount).toBe(0)
    expect(effects.removeProductFromIndex).toHaveBeenCalledWith(product.id)
    expect(effects.revalidateCatalog).toHaveBeenCalledWith({
      id: product.id,
      slug: product.slug,
    })
  })

  it("passes the full gallery to deleteImages on delete", async () => {
    const effects = makeEffects()
    const images = [
      "https://cdn.example.com/gallery-1.jpg",
      "https://cdn.example.com/gallery-2.jpg",
    ]
    const product = await createProduct(
      makeInput({ slug: slug("img-delete"), images })
    )

    await deleteProduct(product.id, effects)

    expect(effects.deleteImages).toHaveBeenCalledOnce()
    expect(effects.deleteImages).toHaveBeenCalledWith(images)
  })

  it("throws ProductNotFoundError when deleting an unknown product", async () => {
    await expect(deleteProduct("unknown-id", makeEffects())).rejects.toThrow(
      ProductNotFoundError
    )
  })

  it("updates variant stock inline and re-indexes the product", async () => {
    const effects = makeEffects()
    const product = await createProduct(makeInput({ slug: slug("stock") }))
    const variant = product.variants[0]

    await updateVariantStock(variant.id, 42, effects)

    const persisted = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    expect(persisted.stock).toBe(42)
    expect(effects.reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({ id: product.id, totalStock: 42 }),
    ])
    expect(effects.revalidateCatalog).toHaveBeenCalledWith({
      id: product.id,
      slug: product.slug,
    })
  })

  it("rejects negative stock on inline update", async () => {
    const product = await createProduct(makeInput({ slug: slug("stock-neg") }))

    await expect(
      updateVariantStock(product.variants[0].id, -1, makeEffects())
    ).rejects.toThrow(CatalogValidationError)
  })

  it("throws VariantNotFoundError for an unknown variant", async () => {
    await expect(
      updateVariantStock("unknown-variant", 5, makeEffects())
    ).rejects.toThrow(VariantNotFoundError)
  })
})
