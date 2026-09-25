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

const { deleteR2ObjectMock } = vi.hoisted(() => ({
  deleteR2ObjectMock: vi.fn(),
}))

vi.mock("@/lib/r2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/r2")>()),
  deleteR2Object: deleteR2ObjectMock,
}))

import { prisma } from "@/lib/db"
import {
  createProduct,
  updateProduct,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"

const runId = randomUUID().slice(0, 8)
const categorySlug = `categorie-suppression-${runId}`
const productSlug = (suffix: string) => `produit-suppression-${runId}-${suffix}`
let categoryId: string

function makeInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Produit suppression",
    slug: productSlug("base"),
    description: "Description",
    brand: "Marque",
    categoryId,
    price: 10000,
    specs: {},
    images: [],
    isFeatured: false,
    featuredOrder: 0,
    freeShipping: false,
    variants: [
      {
        name: "Standard",
        sku: `SKU-SUPPRESSION-${runId}`,
        priceDelta: 0,
        stock: 2,
      },
    ],
    ...overrides,
  }
}

function effetsSilencieux() {
  return {
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
  }
}

describe("suppression post-commit des Images produit persistées", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: "Catégorie suppression", slug: categorySlug },
    })
    categoryId = category.id
  })

  beforeEach(async () => {
    deleteR2ObjectMock.mockReset()
    deleteR2ObjectMock.mockResolvedValue({ ok: true, valeur: null })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `produit-suppression-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `produit-suppression-${runId}-` } },
    })
    await prisma.category.deleteMany({ where: { slug: categorySlug } })
    await prisma.$disconnect()
  })

  it("journalise chaque échec R2 et poursuit les autres suppressions", async () => {
    const firstImage = "https://cdn.example.com/suppression-1.jpg"
    const secondImage = "https://cdn.example.com/suppression-2.jpg"
    const product = await createProduct(
      makeInput({
        slug: productSlug("echec-r2"),
        images: [firstImage, secondImage],
      }),
      effetsSilencieux()
    )
    deleteR2ObjectMock
      .mockResolvedValueOnce({
        ok: false,
        erreur: { code: "erreur-stockage", message: "R2 indisponible" },
      })
      .mockResolvedValueOnce({ ok: true, valeur: null })
    const variants = product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      priceDelta: variant.priceDelta,
      stock: variant.stock,
    }))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    try {
      const updated = await updateProduct(
        product.id,
        makeInput({ slug: productSlug("echec-r2"), images: [], variants }),
        effetsSilencieux()
      )

      expect(updated.images).toEqual([])
      expect(deleteR2ObjectMock.mock.calls).toEqual([
        [firstImage],
        [secondImage],
      ])
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`produit ${product.id}`),
        expect.objectContaining({
          code: "erreur-stockage",
          message: "R2 indisponible",
        })
      )
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(firstImage),
        expect.anything()
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
