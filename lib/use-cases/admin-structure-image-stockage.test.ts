import { randomUUID } from "node:crypto"

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

/**
 * L'effet d'image par défaut de la Structure, éprouvé sans court-circuiter
 * l'adaptateur R2 : c'est le seul moyen de voir qu'une image de catégorie
 * n'est réellement jamais supprimée si la garde d'espace de noms du stockage des
 * Images produit lui est appliquée. Seul le client S3 est remplacé.
 */
const { sendMock, deleteCommandInputs } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  deleteCommandInputs: [] as unknown[],
}))

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send(command: unknown) {
      return sendMock(command)
    }
  }

  class MockDeleteObjectCommand {
    constructor(input: unknown) {
      deleteCommandInputs.push(input)
    }
  }

  return {
    S3Client: MockS3Client,
    DeleteObjectCommand: MockDeleteObjectCommand,
  }
})

import { prisma } from "@/lib/db"
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
} from "@/lib/use-cases/admin-structure"

const runId = randomUUID().slice(0, 8)
const categorySlug = (suffix: string) => `cat-r2-${runId}-${suffix}`
const BASE_PUBLIQUE = "https://cdn.example.test"

const ENV_R2 = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const

const envInitial = new Map(ENV_R2.map((key) => [key, process.env[key]]))

function makeCategoryInput(
  overrides: Partial<CategoryInput> = {}
): CategoryInput {
  return {
    name: "Catégorie R2",
    slug: categorySlug("base"),
    image: null,
    ...overrides,
  }
}

/** Les clés R2 effectivement visées par une suppression. */
function clesSupprimees(): string[] {
  return deleteCommandInputs.map((input) => (input as { Key: string }).Key)
}

describe("effet d'image par défaut de la Structure", () => {
  beforeEach(() => {
    for (const key of ENV_R2) delete process.env[key]
    process.env.R2_ACCOUNT_ID = "account"
    process.env.R2_ACCESS_KEY_ID = "access"
    process.env.R2_SECRET_ACCESS_KEY = "secret"
    process.env.R2_BUCKET = "bucket"
    process.env.R2_PUBLIC_URL = BASE_PUBLIQUE
    ;(globalThis as unknown as { r2?: unknown }).r2 = undefined
    sendMock.mockReset()
    sendMock.mockResolvedValue(undefined)
    deleteCommandInputs.length = 0
  })

  afterEach(() => {
    ;(globalThis as unknown as { r2?: unknown }).r2 = undefined
  })

  afterAll(async () => {
    for (const key of ENV_R2) {
      const value = envInitial.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-r2-${runId}-` } },
    })
    await prisma.$disconnect()
  })

  it("supprime réellement une image de catégorie, hors du préfixe des Images produit", async () => {
    const image = `${BASE_PUBLIQUE}/categories/2026/vintage.jpg`
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("hors-produits"), image })
    )

    await updateCategory(
      category.id,
      makeCategoryInput({
        slug: categorySlug("hors-produits"),
        image: `${BASE_PUBLIQUE}/categories/2026/remplacement.jpg`,
      })
    )

    // L'URL de la catégorie n'est pas sous `products/` : l'appliquer une garde
    // d'espace de noms de produit la refusait en silence, et l'objet restait
    // dans le bucket pour toujours.
    expect(clesSupprimees()).toEqual(["categories/2026/vintage.jpg"])
  })

  it("supprime l'image de catégorie portée par une catégorie supprimée", async () => {
    const image = `${BASE_PUBLIQUE}/categories/2026/supprimee.png`
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("suppression"), image })
    )

    await deleteCategory(category.id)

    expect(clesSupprimees()).toEqual(["categories/2026/supprimee.png"])
  })

  it("refuse l'espace réservé des Brouillons et le journalise", async () => {
    const brouillonAbandonne = `${BASE_PUBLIQUE}/products/brouillons/draft-1.jpg`
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const category = await createCategory(
      makeCategoryInput({
        slug: categorySlug("brouillon"),
        image: brouillonAbandonne,
      })
    )

    try {
      await updateCategory(
        category.id,
        makeCategoryInput({
          slug: categorySlug("brouillon"),
          image: `${BASE_PUBLIQUE}/categories/2026/remplacement.jpg`,
        })
      )

      expect(clesSupprimees()).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(brouillonAbandonne),
        expect.objectContaining({ code: "parametre-invalide" })
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("journalise une panne R2 sans faire échouer la mutation de Structure", async () => {
    sendMock.mockRejectedValueOnce(new Error("secret AWS failure"))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const image = `${BASE_PUBLIQUE}/categories/2026/panne.jpg`
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("panne"), image })
    )

    try {
      const updated = await updateCategory(
        category.id,
        makeCategoryInput({
          slug: categorySlug("panne"),
          image: `${BASE_PUBLIQUE}/categories/2026/remplacement.jpg`,
        })
      )

      expect(updated.image).toBe(
        `${BASE_PUBLIQUE}/categories/2026/remplacement.jpg`
      )
      expect(
        await prisma.category.findUniqueOrThrow({ where: { id: category.id } })
      ).toMatchObject({
        image: `${BASE_PUBLIQUE}/categories/2026/remplacement.jpg`,
      })
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(image),
        expect.anything()
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
