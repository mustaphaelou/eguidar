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

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send(command: unknown) {
      return sendMock(command)
    }
  }

  class MockDeleteObjectCommand {}

  return {
    S3Client: MockS3Client,
    DeleteObjectCommand: MockDeleteObjectCommand,
  }
})

import { prisma } from "@/lib/db"
import {
  createProduct,
  updateProduct,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"

const runId = randomUUID().slice(0, 8)
const categorySlug = `categorie-panne-r2-${runId}`
const productSlug = (suffix: string) => `produit-panne-r2-${runId}-${suffix}`
const BASE_PUBLIQUE = "https://cdn.example.test"
let categoryId: string

const ENV_R2 = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const

const envInitial = new Map(ENV_R2.map((key) => [key, process.env[key]]))

function makeInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Produit panne R2",
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
      { name: "Standard", sku: `SKU-PANNE-${runId}`, priceDelta: 0, stock: 2 },
    ],
    ...overrides,
  }
}

function effetsSilencieux() {
  return {
    reindexProducts: vi.fn(async () => {}),
    removeProductFromIndex: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
  }
}

function journalDeSuppression(warnSpy: {
  mock: { calls: unknown[][] }
}): string[] {
  return warnSpy.mock.calls
    .map(([message]) => message)
    .filter(
      (message): message is string =>
        typeof message === "string" &&
        message.includes("suppression d'image R2 non effectuée")
    )
}

describe("suppression post-commit des Images produit persistées, sans court-circuiter R2", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: "Catégorie panne R2", slug: categorySlug },
    })
    categoryId = category.id
  })

  beforeEach(async () => {
    for (const key of ENV_R2) delete process.env[key]
    process.env.R2_ACCOUNT_ID = "account"
    process.env.R2_ACCESS_KEY_ID = "access"
    process.env.R2_SECRET_ACCESS_KEY = "secret"
    process.env.R2_BUCKET = "bucket"
    process.env.R2_PUBLIC_URL = BASE_PUBLIQUE
    ;(globalThis as unknown as { r2?: unknown }).r2 = undefined
    sendMock.mockReset()
    sendMock.mockResolvedValue(undefined)
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `produit-panne-r2-${runId}-` } },
    })
  })

  afterAll(async () => {
    for (const key of ENV_R2) {
      const value = envInitial.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `produit-panne-r2-${runId}-` } },
    })
    await prisma.category.deleteMany({ where: { slug: categorySlug } })
    await prisma.$disconnect()
  })

  it("journalise un refus par URL en échec et tient la mutation engagee", async () => {
    sendMock.mockRejectedValue(new Error("secret AWS failure"))
    const images = [
      `${BASE_PUBLIQUE}/products/image-1.jpg`,
      `${BASE_PUBLIQUE}/products/image-2.jpg`,
    ]
    const product = await createProduct(
      makeInput({
        slug: productSlug("panne"),
        images: [...images],
      }),
      effetsSilencieux()
    )
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
        makeInput({ slug: productSlug("panne"), images: [], variants }),
        effetsSilencieux()
      )

      expect(updated.images).toEqual([])
      expect(
        await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).toMatchObject({ images: [] })
      expect(journalDeSuppression(warnSpy)).toHaveLength(images.length)
      for (const image of images) {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            `suppression d'image R2 non effectuée pour ${product.id}, image ${image}`
          ),
          expect.objectContaining({ code: "erreur-stockage" })
        )
      }
    } finally {
      warnSpy.mockRestore()
    }
  })
})
