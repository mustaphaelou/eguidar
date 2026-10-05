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
  // Seule la lecture est stubée : `estAdmin` reste la vraie règle du module,
  // sans quoi la suite ne prouverait plus le refus de l'Administration.
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: mocks.sessionCouranteMock,
  }
})
// La réindexation de l'action ne doit pas partir vers Meilisearch : seul le
// fait qu'elle soit appelée avec les faits committés intéresse cette suite.
vi.mock("@/lib/meili", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meili")>()),
  indexProductDocuments: reindexProductsMock,
}))

import {
  createCategoryAction,
  deleteCategoryAction,
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

/**
 * Le formulaire tel que le rend `CategoryForm` : le champ caché `parentId` n'y
 * est présent que si une parente est choisie, donc cette fabrication — qui ne
 * l'ajoute jamais — est le chemin de l'absence.
 */
function categoryFormData(suffix: string, champs: Record<string, string> = {}) {
  const data = new FormData()
  data.append("name", "Structure")
  data.append("slug", categorySlug(suffix))
  for (const [cle, valeur] of Object.entries(champs)) data.append(cle, valeur)
  return data
}

/**
 * Le formulaire tel que le rend `DeleteCategoryButton` : ni `reassignToCategoryId`
 * ni `reparentChildrenToCategoryId` n'y sont présents tant que l'éditeur n'a
 * choisi aucune cible, donc ne jamais les ajouter est le chemin de l'absence.
 */
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
  // La case a cocher ne parle pas par absence : elle porte `on`, et c'est
  // cette présence qui est le choix. Ne jamais l'ajouter reste donc le chemin
  // du refus, comme pour les deux cibles.
  if (orphanProducts) {
    data.append("orphanProducts", "on")
  }
  return data
}

/** Le Produit de test rattaché à la Structure donnée, sous son propre slug. */
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

// Même forme de nettoyage que dans `admin-structure.test.ts`, mais sous les
// préfixes propres à cette suite (`cat-act-`/`prod-act-` et son runId) :
// chaque suite balise ses lignes pour que son nettoyage ne touche jamais
// celles d'une autre suite qui tourne sur la même base. La forme est donc
// copiée à dessein : un préfixe partagé couplerait les deux espaces de noms.
async function balayer() {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `prod-act-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `cat-act-${runId}-` } },
  })
}

/** Le même balayage, plus les deux mocks remis à zéro entre deux cas. */
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
    // `redirect()` est le dernier geste de `run` : la suite le voit comme un
    // rejet, et l'écriture est donc lue en base plutôt que dans un retour.
    await expect(
      createCategoryAction({}, categoryFormData("racine"))
    ).rejects.toThrow(RedirectSentinel)

    await expect(
      prisma.category.findUnique({ where: { slug: categorySlug("racine") } })
    ).resolves.toMatchObject({ name: "Structure", parentId: null })
  })

  it("ne reconnaît aucune valeur magique : une parente inconnue reste une parente inconnue", async () => {
    // `"none"` était la sentinelle de l'absence de parente, transportée
    // jusqu'ici depuis un module `"use client"`. L'action ne la connaît plus :
    // elle la lit comme l'identifiant d'une Structure qui n'existe pas.
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
    // Un cycle écrit directement en base, hors de toute mutation de Structure :
    // sans garde dans la marche d'acyclicité, celle-ci remontait la chaîne sans
    // fin jusqu'au délai de transaction et sortait de l'action en `P2028`,
    // exception non rattrapée. Le garde la rend au formulaire, comme tout
    // refus de la Structure (ADR-0027, amendement de #490).
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

    await expect(
      updateCategoryAction(
        {},
        categoryFormData("cycle-deja-base-hote", {
          categoryId: structure.id,
          parentId: a.id,
        })
      )
    ).resolves.toEqual({
      error:
        "Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle",
    })

    await expect(
      prisma.category.findUnique({ where: { id: structure.id } })
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
    // Le Produit survit, sans Structure. C'est toute la décision, et elle se
    // lit ici à travers l'action serveur plutôt qu'à travers le module.
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: null })
  })

  it("refuse encore quand le formulaire ne coche ni l'orphelinat ni de cible", async () => {
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
