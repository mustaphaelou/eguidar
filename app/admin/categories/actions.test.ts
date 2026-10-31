import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { RedirectSentinel, sessionCouranteMock } from "@/test/navigation-mocks"

const { reindexProductsMock } = vi.hoisted(() => ({
  reindexProductsMock: vi.fn(),
}))

vi.mock("next/navigation", async () => {
  const mocks = await import("@/test/navigation-mocks")
  return { redirect: mocks.redirectMock }
})
vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => {
  const mocks = await import("@/test/navigation-mocks")
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: mocks.sessionCouranteMock,
  }
})
vi.mock("@/lib/meili", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meili")>()),
  indexProductDocuments: reindexProductsMock,
}))

import {
  createCategoryAction,
  deleteCategoryAction,
  deplacerStructureAction,
  updateCategoryAction,
} from "@/app/admin/categories/actions"
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

function categoryFormData(suffix: string, champs: Record<string, string> = {}) {
  const data = new FormData()
  data.append("name", "Structure")
  data.append("slug", categorySlug(suffix))
  for (const [cle, valeur] of Object.entries(champs)) data.append(cle, valeur)
  return data
}

function deleteFormData(
  categoryId: string,
  reassignToCategoryId?: string,
  reparentChildrenToCategoryId?: string,
  orphanProducts = false
): FormData {
  const data = new FormData()
  data.append("categoryId", categoryId)
  if (reassignToCategoryId) {
    data.append("reassignToCategoryId", reassignToCategoryId)
  }
  if (reparentChildrenToCategoryId) {
    data.append("reparentChildrenToCategoryId", reparentChildrenToCategoryId)
  }
  if (orphanProducts) {
    data.append("orphanProducts", "on")
  }
  return data
}

async function makeProductIn(category: { id: string }, suffix: string) {
  return prisma.product.create({
    data: {
      name: "Produit de l'action",
      slug: productSlug(suffix),
      description: "desc",
      brand: "Marque",
      price: 10000,
      specs: {},
      images: [],
      categoryId: category.id,
    },
  })
}

async function makeCategoryWithProduct(slugSuffix: string) {
  const category = await prisma.category.create({
    data: { name: "Structure à supprimer", slug: categorySlug(slugSuffix) },
  })
  const product = await makeProductIn(category, slugSuffix)
  return { category, product }
}

async function makeCategory(slugSuffix: string, parentId?: string) {
  return prisma.category.create({
    data: {
      name: "Structure",
      slug: categorySlug(slugSuffix),
      ...(parentId ? { parentId } : {}),
    },
  })
}

async function balayer() {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `prod-act-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `cat-act-${runId}-` } },
  })
}

async function reinitialiser() {
  sessionCouranteMock.mockReset()
  sessionCouranteMock.mockResolvedValue(ADMIN)
  reindexProductsMock.mockClear()
  await balayer()
}

describe("createCategoryAction", () => {
  beforeEach(reinitialiser)
  afterAll(balayer)

  it("enregistre une Structure racine quand le formulaire n'envoie aucune parente", async () => {
    await expect(
      createCategoryAction({}, categoryFormData("racine"))
    ).rejects.toThrow(RedirectSentinel)

    await expect(
      prisma.category.findUnique({ where: { slug: categorySlug("racine") } })
    ).resolves.toMatchObject({ name: "Structure", parentId: null })
  })

  it("ne reconnaît aucune valeur magique : une parente inconnue reste une parente inconnue", async () => {
    await expect(
      createCategoryAction(
        {},
        categoryFormData("magique", { parentId: "none" })
      )
    ).resolves.toEqual({
      error: "Données invalides : catégorie parente inconnue",
    })
    await expect(
      prisma.category.findUnique({ where: { slug: categorySlug("magique") } })
    ).resolves.toBeNull()
  })
})

describe("updateCategoryAction", () => {
  beforeEach(reinitialiser)
  afterAll(balayer)

  it("ramène en racine une Structure dont le formulaire n'envoie aucune parente", async () => {
    const parente = await makeCategory("parent-haut")
    const structure = await makeCategory("enfant", parente.id)

    await expect(
      updateCategoryAction(
        {},
        categoryFormData("enfant-modifiee", { categoryId: structure.id })
      )
    ).rejects.toThrow(RedirectSentinel)

    await expect(
      prisma.category.findUnique({ where: { id: structure.id } })
    ).resolves.toMatchObject({ parentId: null })
  })

  it("conserve la parente choisie quand le formulaire l'envoie", async () => {
    const parente = await makeCategory("parent-conserve")
    const structure = await makeCategory("enfant-conserve")

    await expect(
      updateCategoryAction(
        {},
        categoryFormData("enfant-rattachee", {
          categoryId: structure.id,
          parentId: parente.id,
        })
      )
    ).rejects.toThrow(RedirectSentinel)

    await expect(
      prisma.category.findUnique({ where: { id: structure.id } })
    ).resolves.toMatchObject({ parentId: parente.id })
  })

  it("rend au formulaire le refus d'une parente dont la chaîne porte déjà un cycle", async () => {
    const structure = await makeCategory("cycle-deja-base-hote")
    const a = await makeCategory("cycle-deja-base-a")
    const b = await makeCategory("cycle-deja-base-b")
    await prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id: a.id },
        data: { parentId: b.id },
      })
      await tx.category.update({
        where: { id: b.id },
        data: { parentId: a.id },
      })
    })

    const issue = await updateCategoryAction(
      {},
      categoryFormData("cycle-deja-base-hote", {
        categoryId: structure.id,
        parentId: a.id,
      })
    )
    expect(issue.error).toContain(
      "Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle"
    )
    expect(issue.error).toContain("l'arête")

    await expect(
      prisma.category.findUnique({ where: { id: structure.id } })
    ).resolves.toMatchObject({ parentId: null })
  })
})

describe("deplacerStructureAction", () => {
  beforeEach(reinitialiser)
  afterAll(balayer)

  async function faireStructure(
    name: string,
    suffixe: string,
    parentId?: string
  ) {
    return prisma.category.create({
      data: {
        name,
        slug: categorySlug(suffixe),
        ...(parentId ? { parentId } : {}),
      },
    })
  }

  function deplacementFormData(
    categoryId: string,
    nouvelleParenteId: string | null,
    avantId: string | null
  ): FormData {
    const data = new FormData()
    data.append("categoryId", categoryId)
    if (nouvelleParenteId) data.append("nouvelleParenteId", nouvelleParenteId)
    if (avantId) data.append("avantId", avantId)
    return data
  }

  it("déplace et rend le message que la région polie annonce", async () => {
    const racine = await faireStructure("Chaussures", "mv-annonce-racine")
    const a = await faireStructure("Bottes", "mv-annonce-a", racine.id)
    const b = await faireStructure("Sandales", "mv-annonce-b", racine.id)

    await expect(
      deplacerStructureAction({}, deplacementFormData(b.id, racine.id, a.id))
    ).resolves.toEqual({
      message: "Déplacée sous Chaussures, position 1 sur 2",
    })

    const ordre = await prisma.category.findMany({
      where: { parentId: racine.id },
      orderBy: { position: "asc" },
      select: { id: true },
    })
    expect(ordre.map((sœur) => sœur.id)).toEqual([b.id, a.id])
  })

  it("rend le refus nommé d'une destination dans la sous-structure déplacée", async () => {
    const racine = await faireStructure("Racine refus", "mv-refus-racine")
    const a = await faireStructure("Enfant refus", "mv-refus-a", racine.id)
    const petit = await faireStructure("Petit refus", "mv-refus-petit", a.id)

    const issue = await deplacerStructureAction(
      {},
      deplacementFormData(a.id, petit.id, null)
    )

    expect(issue.error).toContain("descendantes")
    await expect(
      prisma.category.findUnique({ where: { id: a.id } })
    ).resolves.toMatchObject({ parentId: racine.id })
  })

  it("rend le refus d'un cycle en nommant l'arête qui le ferme", async () => {
    const deplacee = await faireStructure("À rattacher", "mv-cycle-deplacee")
    const a = await faireStructure("Cycle A", "mv-cycle-a")
    const b = await faireStructure("Cycle B", "mv-cycle-b")
    await prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id: a.id },
        data: { parentId: b.id },
      })
      await tx.category.update({
        where: { id: b.id },
        data: { parentId: a.id },
      })
    })

    const issue = await deplacerStructureAction(
      {},
      deplacementFormData(deplacee.id, a.id, null)
    )

    expect(issue.error).toContain("Cycle A")
    expect(issue.error).toContain("Cycle B")
    expect(issue.error).toContain("l'arête")
    await expect(
      prisma.category.findUnique({ where: { id: deplacee.id } })
    ).resolves.toMatchObject({ parentId: null })
  })
})

describe("deleteCategoryAction", () => {
  beforeEach(reinitialiser)

  afterAll(async () => {
    await balayer()
    await prisma.$disconnect()
  })

  it("supprime une Structure vide quand le formulaire n'envoie aucune cible de réaffectation", async () => {
    const structure = await makeCategory("feuille-vide")

    await expect(
      deleteCategoryAction({}, deleteFormData(structure.id))
    ).resolves.toEqual({})

    await expect(
      prisma.category.findUnique({ where: { id: structure.id } })
    ).resolves.toBeNull()
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

  it("laisse les Produits sans Structure quand le formulaire coche l'orphelinat", async () => {
    const { category, product } = await makeCategoryWithProduct("orphelin")

    await expect(
      deleteCategoryAction(
        {},
        deleteFormData(category.id, undefined, undefined, true)
      )
    ).resolves.toEqual({})

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: null })
  })

  it("refuse encore quand le formulaire ne coche ni l'orphelinat ni une cible", async () => {
    const { category, product } = await makeCategoryWithProduct("refus-defaut")

    const resultat = await deleteCategoryAction({}, deleteFormData(category.id))

    expect(resultat).toEqual({
      error: "Refus de la Structure : 1 Produit lui est rattaché",
    })
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
  })

  it("rattache les sous-catégories à la Structure d'accueil choisie puis supprime la Structure", async () => {
    const structure = await makeCategory("avec-enfants")
    const enfant = await makeCategory("enfant-a-deplacer", structure.id)
    const accueil = await makeCategory("accueil")

    await expect(
      deleteCategoryAction(
        {},
        deleteFormData(structure.id, undefined, accueil.id)
      )
    ).resolves.toEqual({})

    await expect(
      prisma.category.findUnique({ where: { id: structure.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.category.findUnique({ where: { id: enfant.id } })
    ).resolves.toMatchObject({ parentId: accueil.id })
  })

  it("refuse encore une Structure qui a des sous-catégories quand le formulaire n'envoie aucune Structure d'accueil", async () => {
    const structure = await makeCategory("mur-de-sous-categories")
    const enfant = await makeCategory("enfant-qui-reste", structure.id)

    const resultat = await deleteCategoryAction(
      {},
      deleteFormData(structure.id)
    )

    expect(resultat).toEqual({
      error: "Refus de la Structure : elle contient des sous-catégories",
    })
    await expect(
      prisma.category.findUnique({ where: { id: structure.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.category.findUnique({ where: { id: enfant.id } })
    ).resolves.toMatchObject({ parentId: structure.id })
  })

  it("remet le refus de réaffectation vers la Structure supprimée elle-même au formulaire", async () => {
    const { category, product } = await makeCategoryWithProduct("refus")

    const resultat = await deleteCategoryAction(
      {},
      deleteFormData(category.id, category.id)
    )

    expect(resultat).toEqual({
      error:
        "Données invalides : une catégorie ne peut pas être réassignée vers elle-même",
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
