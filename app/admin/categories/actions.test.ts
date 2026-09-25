import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { sessionCouranteMock } from "@/test/navigation-mocks"

const { reindexProductsMock } = vi.hoisted(() => ({
  reindexProductsMock: vi.fn(),
}))

vi.mock("next/navigation", async () => {
  const h = await import("@/test/navigation-mocks")
  return { redirect: h.redirectMock }
})
vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => {
  const h = await import("@/test/navigation-mocks")
  // Seule la lecture est stubée : `estAdmin` reste la vraie règle du module,
  // sans quoi la suite ne prouverait plus le refus de l'Administration.
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: h.sessionCouranteMock,
  }
})
// La réindexation de l'action ne doit pas partir vers Meilisearch : seul le
// fait qu'elle soit appelée avec les faits committés intéresse cette suite.
vi.mock("@/lib/meili", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meili")>()),
  indexProductDocuments: reindexProductsMock,
}))

import { deleteCategoryAction } from "@/app/admin/categories/actions"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const categorySlug = (suffix: string) => `cat-act-${runId}-${suffix}`
const productSlug = (suffix: string) => `prod-act-${runId}-${suffix}`

const ADMIN: Client = {
  id: "editeur-1",
  name: "Éditeur",
  email: "editeur@example.test",
  role: "admin",
}

function deleteFormData(
  categoryId: string,
  reassignToCategoryId?: string
): FormData {
  const data = new FormData()
  data.append("categoryId", categoryId)
  if (reassignToCategoryId) {
    data.append("reassignToCategoryId", reassignToCategoryId)
  }
  return data
}

async function makeCategoryWithProduct(slugSuffix: string) {
  const category = await prisma.category.create({
    data: { name: "Structure à supprimer", slug: categorySlug(slugSuffix) },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit de l'action",
      slug: productSlug(slugSuffix),
      description: "desc",
      brand: "Marque",
      price: 10000,
      specs: {},
      images: [],
      categoryId: category.id,
    },
  })
  return { category, product }
}

describe("deleteCategoryAction", () => {
  beforeEach(async () => {
    sessionCouranteMock.mockReset()
    sessionCouranteMock.mockResolvedValue(ADMIN)
    reindexProductsMock.mockClear()
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `prod-act-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-act-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `prod-act-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-act-${runId}-` } },
    })
    await prisma.$disconnect()
  })

  it("réaffecte les Produits et supprime la Structure à travers l'interface Structure", async () => {
    const { category, product } = await makeCategoryWithProduct("succes")
    const target = await prisma.category.create({
      data: { name: "Structure cible", slug: categorySlug("cible") },
    })

    await expect(
      deleteCategoryAction({}, deleteFormData(category.id, target.id))
    ).resolves.toEqual({})

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: target.id })
    expect(reindexProductsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: product.id }),
    ])
  })

  it("remet le refus de réaffectation vers la Structure supprimée elle-même au formulaire", async () => {
    const { category, product } = await makeCategoryWithProduct("refus")

    const resultat = await deleteCategoryAction(
      {},
      deleteFormData(category.id, category.id)
    )

    expect(resultat).toEqual({
      error: "Données invalides : une catégorie ne peut pas être réassignée vers elle-même",
    })
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expect(reindexProductsMock).not.toHaveBeenCalled()
  })
})
