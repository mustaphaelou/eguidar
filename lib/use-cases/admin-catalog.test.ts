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

import { RevendicationImagesProduit } from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import {
  CatalogValidationError,
  createProduct,
  deleteProduct,
  DraftPromotionRefusedError,
  DuplicateSkuError,
  ProductNotFoundError,
  SlugConflictError,
  updateProduct,
  updateVariantStock,
  VariantNotFoundError,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  verifierFrontiereBestEffort,
  verifierRefusValidation,
} from "@/test/mutation-squelette-recette"
import { brouillon, persistee } from "@/test/cycle-vie-image-produit-memoire"

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
    images: [],
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

  it("refuse une mise à jour qui nomme une Image produit d'un autre Produit", async () => {
    const proprietaire = "https://cdn.example.com/owned.jpg"
    const dunAutreProduit = "https://cdn.example.com/dun-autre-produit.jpg"
    const product = await createProduct(
      makeInput({ slug: slug("img-owned"), images: [proprietaire] })
    )
    await createProduct(
      makeInput({
        slug: slug("img-owned-autre"),
        images: [dunAutreProduit],
        variants: [
          {
            name: "Standard",
            sku: `SKU-${runId}-owned-autre`,
            priceDelta: 0,
            stock: 5,
          },
        ],
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

    const refus = await verifierRefusValidation(CatalogValidationError, () =>
      updateProduct(
        product.id,
        makeInput({
          slug: slug("img-owned"),
          images: [proprietaire, dunAutreProduit],
          variants,
        }),
        { deleteImages }
      )
    )
    expect(refus.message).toBe(
      "Données invalides : une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit"
    )
    expect(deleteImages).not.toHaveBeenCalled()
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(persisted.images).toEqual([proprietaire])
  })

  it("reçoit la liaison et les URL promues dans une seule valeur, jamais séparément", () => {
    const galerie = ["https://cdn.example.com/promoted.jpg"]
    const revendication = RevendicationImagesProduit.creer({
      galerie,
      promues: galerie,
      lier: async () => undefined,
    })
    expect(revendication.galerie).toEqual(galerie)
    expect(revendication.promues).toEqual(galerie)

    type FaitsExigesParLaPorte = Parameters<
      typeof RevendicationImagesProduit.creer
    >[0]
    // @ts-expect-error — la porte exige les URL promues
    const sansPromues: FaitsExigesParLaPorte = {
      galerie,
      lier: async () => undefined,
    }
    // @ts-expect-error — la porte exige la liaison
    const sansLier: FaitsExigesParLaPorte = { galerie, promues: galerie }
    // @ts-expect-error — la porte exige la galerie ordonnée
    const sansGalerie: FaitsExigesParLaPorte = {
      promues: galerie,
      lier: async () => undefined,
    }
    expect([sansPromues, sansLier, sansGalerie]).toHaveLength(3)

    // @ts-expect-error — une valeur complète ne se construit pas hors de la porte
    const horsPorte: RevendicationImagesProduit = {
      galerie,
      promues: galerie,
      lier: async () => undefined,
    }

    expect(horsPorte).toBeDefined()
  })

  it("refuse une création qui nomme une Image produit d'un autre Produit", async () => {
    const dunAutreProduit = "https://cdn.example.com/dun-autre-produit.jpg"
    await createProduct(
      makeInput({
        slug: slug("img-autre-proprietaire"),
        images: [dunAutreProduit],
        variants: [
          {
            name: "Standard",
            sku: `SKU-${runId}-autre-proprietaire`,
            priceDelta: 0,
            stock: 5,
          },
        ],
      })
    )

    const refus = await verifierRefusValidation(CatalogValidationError, () =>
      createProduct(
        makeInput({ slug: slug("img-glissee"), images: [dunAutreProduit] })
      )
    )
    expect(refus.message).toBe(
      "Données invalides : une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit"
    )
    const ecrits = await prisma.product.count({
      where: { slug: slug("img-glissee") },
    })
    expect(ecrits).toBe(0)
  })

  it("accepte une création et une mise à jour dont la galerie porte une URL orpheline", async () => {
    const orpheline = "https://cdn.example.com/orpheline.jpg"
    const ajoutee = "https://cdn.example.com/ajoutee.jpg"
    const product = await createProduct(
      makeInput({ slug: slug("img-orpheline"), images: [orpheline] })
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
        slug: slug("img-orpheline"),
        images: [orpheline, ajoutee],
        variants,
      }),
      { deleteImages }
    )

    expect(deleteImages).toHaveBeenCalledWith([])
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persisted.images).toEqual([orpheline, ajoutee])
  })

  it("accepte une création dont la galerie est faite des URL promues par la même opération", async () => {
    const images = [
      "https://cdn.example.com/promue-1.jpg",
      "https://cdn.example.com/promue-2.jpg",
    ]
    const product = await createProduct(
      makeInput({ slug: slug("img-revendiquee"), images })
    )
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persisted.images).toEqual(images)
  })

  it("accepte une galerie mêlant Entrées de Galerie et URLs nues, dans l'ordre soumis", async () => {
    const premiereNue = "https://cdn.example.com/nue-1.jpg"
    const urlEntree = "https://cdn.example.com/entree-2.jpg"
    const derniereNue = "https://cdn.example.com/nue-3.jpg"
    const product = await createProduct(
      makeInput({
        slug: slug("img-mixte"),
        images: [premiereNue, persistee(urlEntree), derniereNue],
      })
    )
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persisted.images).toEqual([premiereNue, urlEntree, derniereNue])
  })

  it("applique le plafond de huit à la galerie normalisée, Entrées et URLs confondues", async () => {
    const refusees = [
      ...galerie(5).map((url) => persistee(url)),
      ...galerie(4).map((url) => `${url}?nue`),
    ]
    const refus = await verifierRefusValidation(CatalogValidationError, () =>
      createProduct(
        makeInput({ slug: slug("img-mixte-limite"), images: refusees })
      )
    )
    expect(refus.message).toBe(
      "Données invalides : au maximum 8 images par produit"
    )
    const ecrits = await prisma.product.count({
      where: { slug: slug("img-mixte-limite") },
    })
    expect(ecrits).toBe(0)

    const aLaLimite = [
      ...galerie(4).map((url) => persistee(url)),
      ...galerie(4).map((url) => `${url}?nue`),
    ]
    const product = await createProduct(
      makeInput({ slug: slug("img-mixte-limite-pile"), images: aLaLimite })
    )
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persisted.images).toEqual([
      ...galerie(4),
      ...galerie(4).map((url) => `${url}?nue`),
    ])
  })

  it("refuse un Brouillon d'Image produit inconnu du registre en refus typé", async () => {
    const promesse = createProduct(
      makeInput({
        slug: slug("img-brouillon"),
        images: [brouillon(`brouillon-inconnu-${runId}`)],
        tentativeId: `tentative-${runId}-brouillon-inconnu`,
        ownerId: "editeur-1",
      })
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftPromotionRefusedError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow("Brouillon introuvable")
    const ecrits = await prisma.product.count({
      where: { slug: slug("img-brouillon") },
    })
    expect(ecrits).toBe(0)
  })

  it("refuse un Brouillon d'Image produit sans identifiant de tentative ni de propriétaire", async () => {
    const promesse = createProduct(
      makeInput({
        slug: slug("img-brouillon-sans-identifiants"),
        images: [brouillon("brouillon-2")],
      })
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftPromotionRefusedError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(
      "Tentative d'édition ou propriétaire invalide"
    )
    const ecrits = await prisma.product.count({
      where: { slug: slug("img-brouillon-sans-identifiants") },
    })
    expect(ecrits).toBe(0)
  })

  it("accepte un identifiant de tentative et un identifiant de propriétaire", async () => {
    const product = await createProduct(
      makeInput({
        slug: slug("identifiants"),
        tentativeId: "tentative-1",
        ownerId: "editeur-1",
      })
    )
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { slug: true },
    })
    expect(persisted.slug).toBe(slug("identifiants"))
  })

  it("refuse un identifiant de tentative vide", async () => {
    const refus = await verifierRefusValidation(CatalogValidationError, () =>
      createProduct(
        makeInput({ slug: slug("identifiant-vide"), tentativeId: "" })
      )
    )
    expect(refus.message).toBe(
      "Données invalides : identifiant de tentative invalide"
    )
  })

  it("refuse un identifiant de propriétaire vide", async () => {
    const refus = await verifierRefusValidation(CatalogValidationError, () =>
      createProduct(makeInput({ slug: slug("proprietaire-vide"), ownerId: "" }))
    )
    expect(refus.message).toBe(
      "Données invalides : identifiant de propriétaire invalide"
    )
  })

  it("crée un Produit sans aucune image", async () => {
    const product = await createProduct(makeInput({ slug: slug("img-aucune") }))
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persisted.images).toEqual([])
  })

  it("refuse une galerie au-delà de la limite d'Images produit", async () => {
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
