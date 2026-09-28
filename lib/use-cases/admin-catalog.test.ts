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

import type { RevendicationImagesProduit } from "@/lib/cycle-vie-image-produit"
import { creerRevendicationImagesProduit } from "@/lib/cycle-vie-image-produit"
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
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import {
  verifierFrontiereBestEffort,
  verifierRefusValidation,
} from "@/test/mutation-squelette-recette"

const runId = randomUUID().slice(0, 8)
const slug = (suffix: string) => `p-${runId}-${suffix}`

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

/**
 * Une galerie de `nombre` URL d'Images produit, dans l'ordre de soumission.
 * Le nombre est écrit en clair et non lu dans la borne du Catalogue : une
 * suite qui construit la limite avec la limite ne peut pas prouver que la
 * limite est la bonne.
 */
function galerie(nombre: number): string[] {
  return Array.from(
    { length: nombre },
    (_inutilise, index) => `https://cdn.example.com/limite-${index + 1}.jpg`
  )
}

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
    await verifierRefusValidation(CatalogValidationError, () =>
      createProduct(makeInput({ price: -100 }))
    )
  })

  it("rejects negative stock on a variant", async () => {
    await verifierRefusValidation(CatalogValidationError, () =>
      createProduct(
        makeInput({
          variants: [
            { name: "A", sku: `SKU-${runId}-neg`, priceDelta: 0, stock: -2 },
          ],
        })
      )
    )
  })

  it("rejects a variant whose final price (price + delta) is negative", async () => {
    await verifierRefusValidation(CatalogValidationError, () =>
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
    )
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
      makeInput({
        slug: slug("update-idx"),
        name: "Produit renommé",
        variants: kept,
      }),
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

  it("supprime une seule Image produit après le commit de la mise à jour", async () => {
    const keptImage = "https://cdn.example.com/keep.jpg"
    const removedImage = "https://cdn.example.com/remove.jpg"
    const product = await createProduct(
      makeInput({ slug: slug("img-one"), images: [keptImage, removedImage] })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const deleteImages = vi.fn(async () => {
      const committed = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { images: true },
      })
      expect(committed.images).toEqual([keptImage])
    })

    const updated = await updateProduct(
      product.id,
      makeInput({
        slug: slug("img-one"),
        images: [keptImage],
        variants,
      }),
      { deleteImages }
    )

    expect(updated.images).toEqual([keptImage])
    expect(deleteImages).toHaveBeenCalledOnce()
    expect(deleteImages).toHaveBeenCalledWith([removedImage])
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
    const deleteImages = vi.fn(async () => {
      const committed = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { images: true },
      })
      expect(committed.images).toEqual(["https://cdn.example.com/keep-1.jpg"])
    })

    await updateProduct(
      product.id,
      makeInput({
        slug: slug("img-update"),
        images: ["https://cdn.example.com/keep-1.jpg"],
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

  it("n'appelle aucune suppression d'image lorsque la transaction échoue", async () => {
    const persistedImage = "https://cdn.example.com/transaction.jpg"
    const product = await createProduct(
      makeInput({ slug: slug("img-transaction"), images: [persistedImage] })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const deleteImages = vi.fn(async () => {})

    await expect(
      updateProduct(
        product.id,
        makeInput({
          slug: slug("img-transaction"),
          categoryId: randomUUID(),
          images: [],
          variants,
        }),
        { deleteImages }
      )
    ).rejects.toThrow()

    expect(deleteImages).not.toHaveBeenCalled()
    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(unchanged.images).toEqual([persistedImage])
  })

  it("refuse une Image produit persistée qui n'appartient pas au Produit", async () => {
    const product = await createProduct(
      makeInput({
        slug: slug("img-owned"),
        images: ["https://cdn.example.com/owned.jpg"],
      })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const deleteImages = vi.fn(async () => {})

    await verifierRefusValidation(CatalogValidationError, () =>
      updateProduct(
        product.id,
        makeInput({
          slug: slug("img-owned"),
          images: [
            "https://cdn.example.com/owned.jpg",
            "https://cdn.example.com/arbitrary.jpg",
          ],
          variants,
        }),
        { deleteImages }
      )
    )
    expect(deleteImages).not.toHaveBeenCalled()
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(persisted.images).toEqual(["https://cdn.example.com/owned.jpg"])
  })

  it("reçoit la liaison et les URL promues dans une seule valeur, jamais séparément", () => {
    const galerie = ["https://cdn.example.com/promoted.jpg"]
    const revendication = creerRevendicationImagesProduit({
      galerie,
      promues: galerie,
      lier: async () => undefined,
    })
    expect(revendication.galerie).toEqual(galerie)
    expect(revendication.promues).toEqual(galerie)

    // Verrous de compilation. Chacun se lit sur la porte, jamais sur la valeur :
    // c'est là que les trois faits sont exigés, et c'est là qu'une exigence qui
    // tombe se voit. Si l'une disparaît — `promues` ou `lier` rendu facultatif,
    // la liaison et les URL promues rendues à deux paramètres séparés — la
    // directive devient inutile et `tsc --noEmit` échoue.
    //
    // @ts-expect-error — la porte exige les URL promues
    creerRevendicationImagesProduit({ galerie, lier: async () => undefined })
    // @ts-expect-error — la porte exige la liaison
    creerRevendicationImagesProduit({ galerie, promues: galerie })
    // @ts-expect-error — la porte exige la galerie ordonnée
    creerRevendicationImagesProduit({
      promues: galerie,
      lier: async () => undefined,
    })

    // Et la valeur elle-même ne se fabrique pas à la main, même complète : sa
    // marque est privée, donc attribuable à la seule classe.
    // @ts-expect-error — une valeur complète ne se construit pas hors de la porte
    const horsPorte: RevendicationImagesProduit = {
      galerie,
      promues: galerie,
      lier: async () => undefined,
    }

    expect(horsPorte).toBeDefined()
  })

  it("refuse une galerie au-delà de la limite d'Images produit", async () => {
    // La limite est un fait du Catalogue : il la refuse à l'entrée, donc une
    // soumission qui la dépasse est refusée avant qu'un Produit n'existe, et
    // avec le message de validation du Catalogue — la même forme qu'un autre
    // champ invalide.
    const refus = await verifierRefusValidation(CatalogValidationError, () =>
      createProduct(makeInput({ slug: slug("img-limite"), images: galerie(9) }))
    )
    expect(refus.message).toBe(
      "Données invalides : au maximum 8 images par produit"
    )
    const ecrits = await prisma.product.count({
      where: { slug: slug("img-limite") },
    })
    expect(ecrits).toBe(0)
  })

  it("accepte une galerie à la limite d'Images produit", async () => {
    const images = galerie(8)
    const product = await createProduct(
      makeInput({ slug: slug("img-limite-pile"), images })
    )
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persisted.images).toEqual(images)
  })

  it("refuse une galerie au-delà de la limite et laisse la galerie enregistrée", async () => {
    const enregistree = "https://cdn.example.com/deja-enregistree.jpg"
    const product = await createProduct(
      makeInput({ slug: slug("img-limite-maj"), images: [enregistree] })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))
    const deleteImages = vi.fn(async () => {})

    // Les neuf URL soumises sont aussi des URL étrangères au Produit : c'est
    // donc le message de la limite, et non celui de la propriété d'une Image
    // produit, qui doit être rendu — la validation d'entrée tranche avant la
    // comparaison des images. Et l'Image produit déjà enregistrée reste la
    // sienne : un enregistrement refusé n'a rien supprimé.
    const refus = await verifierRefusValidation(CatalogValidationError, () =>
      updateProduct(
        product.id,
        makeInput({
          slug: slug("img-limite-maj"),
          images: galerie(9),
          variants,
        }),
        { deleteImages }
      )
    )
    expect(refus.message).toBe(
      "Données invalides : au maximum 8 images par produit"
    )
    expect(deleteImages).not.toHaveBeenCalled()
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persisted.images).toEqual([enregistree])
  })

  it("ne traite pas une URL promue comme une Image produit supprimée", async () => {
    const product = await createProduct(
      makeInput({ slug: slug("img-promoted"), images: [] })
    )
    const promotedImage = "https://cdn.example.com/promoted.jpg"
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
        slug: slug("img-promoted"),
        images: [promotedImage],
        variants,
      }),
      { deleteImages },
      creerRevendicationImagesProduit({
        galerie: [promotedImage],
        promues: [promotedImage],
        lier: async () => undefined,
      })
    )

    expect(deleteImages).toHaveBeenCalledOnce()
    expect(deleteImages).toHaveBeenCalledWith([])
  })

  it("refuse une URL glissée même quand une revendication est fournie", async () => {
    const product = await createProduct(
      makeInput({
        slug: slug("img-claim"),
        images: ["https://cdn.example.com/owned.jpg"],
      })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))

    // La revendication n'autorise que les URL qu'elle a promues : une URL
    // étrangère, même accompanied d'une liaison valide, reste une URL
    // glissée par le client.
    await verifierRefusValidation(CatalogValidationError, () =>
      updateProduct(
        product.id,
        makeInput({
          slug: slug("img-claim"),
          images: [
            "https://cdn.example.com/owned.jpg",
            "https://cdn.example.com/smuggled.jpg",
          ],
          variants,
        }),
        undefined,
        creerRevendicationImagesProduit({
          galerie: ["https://cdn.example.com/owned.jpg"],
          promues: ["https://cdn.example.com/promoted.jpg"],
          lier: async () => undefined,
        })
      )
    )
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

    await verifierRefusValidation(CatalogValidationError, () =>
      updateProduct(first.id, makeInput({ slug: slug("own-a"), variants }))
    )

    const untouched = await prisma.productVariant.findUniqueOrThrow({
      where: { id: foreignVariant.id },
    })
    expect(untouched.name).toBe("Standard")
  })

  it("throws ProductNotFoundError when updating an unknown product", async () => {
    await expect(updateProduct("unknown-id", makeInput())).rejects.toThrow(
      ProductNotFoundError
    )
  })

  it("deletes the product with its variants and clears the search index", async () => {
    const removeProductFromIndex = vi.fn(async () => {})
    const revalidateCatalog = vi.fn()
    const deleteImages = vi.fn(async () => {})
    const product = await createProduct(makeInput({ slug: slug("delete") }))

    await deleteProduct(product.id, {
      deleteImages,
      removeProductFromIndex,
      revalidateCatalog,
    })

    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toBeNull()
    const variantCount = await prisma.productVariant.count({
      where: { productId: product.id },
    })
    expect(variantCount).toBe(0)
    expect(removeProductFromIndex).toHaveBeenCalledWith(product.id)
    expect(revalidateCatalog).toHaveBeenCalledWith({
      id: product.id,
      slug: product.slug,
    })
  })

  it("passes the full gallery to deleteImages on delete", async () => {
    const deleteImages = vi.fn(async () => {})
    const images = [
      "https://cdn.example.com/gallery-1.jpg",
      "https://cdn.example.com/gallery-2.jpg",
    ]
    const product = await createProduct(
      makeInput({ slug: slug("img-delete"), images })
    )

    await deleteProduct(product.id, { deleteImages })

    expect(deleteImages).toHaveBeenCalledOnce()
    expect(deleteImages).toHaveBeenCalledWith(images)
  })

  it("throws ProductNotFoundError when deleting an unknown product", async () => {
    await expect(deleteProduct("unknown-id")).rejects.toThrow(
      ProductNotFoundError
    )
  })

  it("updates variant stock inline and re-indexes the product", async () => {
    const reindexProducts = vi.fn(async () => {})
    const revalidateCatalog = vi.fn()
    const product = await createProduct(makeInput({ slug: slug("stock") }))
    const variant = product.variants[0]

    await updateVariantStock(variant.id, 42, {
      reindexProducts,
      revalidateCatalog,
    })

    const persisted = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    expect(persisted.stock).toBe(42)
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({ id: product.id, totalStock: 42 }),
    ])
    expect(revalidateCatalog).toHaveBeenCalledWith({
      id: product.id,
      slug: product.slug,
    })
  })

  it("rejects negative stock on inline update", async () => {
    const product = await createProduct(makeInput({ slug: slug("stock-neg") }))

    await verifierRefusValidation(CatalogValidationError, () =>
      updateVariantStock(product.variants[0].id, -1)
    )
  })

  it("throws VariantNotFoundError for an unknown variant", async () => {
    await expect(updateVariantStock("unknown-variant", 5)).rejects.toThrow(
      VariantNotFoundError
    )
  })

  it("still persists an update when reindexing fails", async () => {
    const product = await createProduct(
      makeInput({ slug: slug("fail-reindex") })
    )
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))

    const updated = await verifierFrontiereBestEffort(
      "réindexation",
      (effetQuiEchoue) =>
        updateProduct(
          product.id,
          makeInput({ slug: slug("fail-reindex"), name: "Renommé", variants }),
          { reindexProducts: effetQuiEchoue }
        )
    )

    expect(updated.name).toBe("Renommé")
  })

  it("still persists an update when R2 image deletion fails", async () => {
    const product = await createProduct(makeInput({ slug: slug("fail-r2") }))
    const variants = product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceDelta: v.priceDelta,
      stock: v.stock,
    }))

    const updated = await verifierFrontiereBestEffort(
      "suppression",
      (effetQuiEchoue) =>
        updateProduct(
          product.id,
          makeInput({
            slug: slug("fail-r2"),
            name: "Renommé",
            images: [],
            variants,
          }),
          { deleteImages: effetQuiEchoue }
        )
    )

    expect(updated.name).toBe("Renommé")
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(persisted.name).toBe("Renommé")
  })

  it("still deletes the product when index removal fails", async () => {
    const product = await createProduct(makeInput({ slug: slug("fail-index") }))

    await verifierFrontiereBestEffort("index", (effetQuiEchoue) =>
      deleteProduct(product.id, { removeProductFromIndex: effetQuiEchoue })
    )

    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toBeNull()
  })
})
