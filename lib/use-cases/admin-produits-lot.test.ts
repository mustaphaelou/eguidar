import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import type { Product } from "@/lib/generated/prisma/client"
import type { IndexableProduct } from "@/lib/index-projection"
import {
  bulkDelete,
  bulkSetFeatured,
  bulkSetFreeShipping,
  bulkSetStructure,
  duplicateProduct,
  type CatalogEffects,
} from "@/lib/use-cases/admin-catalog"
import { creerStructure, type StructureCreee } from "@/test/structure-fixtures"

const runId = randomUUID().slice(0, 8)
const prefixe = `lot-produits-${runId}-`

let racine: StructureCreee
let enfant: StructureCreee

function effetsSilencieux() {
  return {
    reindexProducts: vi.fn(async (_produits: IndexableProduct[]) => {}),
    removeProductFromIndex: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(() => {}),
    deleteImages: vi.fn(async () => {}),
  } satisfies Partial<CatalogEffects>
}

async function creerProduit(
  cle: string,
  overrides: {
    categoryId?: string | null
    images?: string[]
    stocks?: number[]
    nom?: string
  } = {}
): Promise<Product> {
  return prisma.product.create({
    data: {
      name: overrides.nom ?? `Produit ${cle} ${runId}`,
      slug: `${prefixe}${cle}`,
      description: "Description de test",
      brand: `Marque ${runId}`,
      categoryId:
        overrides.categoryId === undefined ? racine.id : overrides.categoryId,
      price: 10000,
      specs: {},
      images: overrides.images ?? [`https://cdn.example.test/${cle}.jpg`],
      variants: {
        create: (overrides.stocks ?? [1]).map((stock, index) => ({
          name: `Variante ${index + 1}`,
          sku: `SKU-${prefixe}${cle}-${index}`,
          priceDelta: 0,
          stock,
        })),
      },
    },
  })
}

beforeAll(async () => {
  racine = await creerStructure({
    name: `Racine lot ${runId}`,
    prefix: prefixe,
  })
  enfant = await creerStructure({
    name: `Enfant lot ${runId}`,
    parentId: racine.id,
    prefix: prefixe,
  })
})

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefixe } } })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: prefixe } },
  })
  await prisma.$disconnect()
})

describe("les gestes en lot du Catalogue", () => {
  it("met en avant les lignes existantes et rapporte les identifiants absents", async () => {
    const premiere = await creerProduit("avant-1")
    const seconde = await creerProduit("avant-2")
    const absente = randomUUID()
    const effets = effetsSilencieux()

    const rapport = await bulkSetFeatured(
      [premiere.id, absente, seconde.id],
      true,
      effets
    )

    expect(rapport.succes).toEqual([premiere.id, seconde.id])
    expect(rapport.echecs).toEqual([
      { id: absente, raison: "Produit introuvable" },
    ])

    const relues = await prisma.product.findMany({
      where: { id: { in: [premiere.id, seconde.id] } },
      select: { id: true, isFeatured: true },
      orderBy: { id: "asc" },
    })
    expect(relues.every((produit) => produit.isFeatured)).toBe(true)
    expect(effets.reindexProducts).toHaveBeenCalledTimes(1)
    expect(effets.revalidateCatalog).toHaveBeenCalledTimes(2)
  })

  it("règle la livraison offerte dans les deux sens sans toucher aux autres lignes", async () => {
    const cible = await creerProduit("livraison")
    const temoin = await creerProduit("temoin")
    const effets = effetsSilencieux()

    await bulkSetFreeShipping([cible.id], true, effets)
    await bulkSetFreeShipping([cible.id], false, effets)

    await expect(
      prisma.product.findUnique({ where: { id: cible.id } })
    ).resolves.toMatchObject({ freeShipping: false })
    await expect(
      prisma.product.findUnique({ where: { id: temoin.id } })
    ).resolves.toMatchObject({ freeShipping: false })
  })

  it("déplace la Structure des lignes choisies, et refuse une Structure inconnue en le rapportant", async () => {
    const cible = await creerProduit("structure")
    const effets = effetsSilencieux()

    const deplace = await bulkSetStructure([cible.id], enfant.id, effets)
    expect(deplace).toEqual({ succes: [cible.id], echecs: [] })
    await expect(
      prisma.product.findUnique({ where: { id: cible.id } })
    ).resolves.toMatchObject({ categoryId: enfant.id })

    const refus = await bulkSetStructure([cible.id], randomUUID(), effets)
    expect(refus.succes).toEqual([])
    expect(refus.echecs).toEqual([
      { id: cible.id, raison: "Structure introuvable" },
    ])
    await expect(
      prisma.product.findUnique({ where: { id: cible.id } })
    ).resolves.toMatchObject({ categoryId: enfant.id })
  })

  it("supprime les lignes existantes, leurs Variantes et leurs images, en rapportant les absentes", async () => {
    const cible = await creerProduit("suppression", {
      images: [
        "https://cdn.example.test/suppression-a.jpg",
        "https://cdn.example.test/suppression-b.jpg",
      ],
      stocks: [1, 2],
    })
    const absente = randomUUID()
    const effets = effetsSilencieux()

    const rapport = await bulkDelete([cible.id, absente], effets)

    expect(rapport.succes).toEqual([cible.id])
    expect(rapport.echecs).toEqual([
      { id: absente, raison: "Produit introuvable" },
    ])
    await expect(
      prisma.product.findUnique({ where: { id: cible.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.productVariant.count({ where: { productId: cible.id } })
    ).resolves.toBe(0)
    expect(effets.deleteImages).toHaveBeenCalledWith([
      "https://cdn.example.test/suppression-a.jpg",
      "https://cdn.example.test/suppression-b.jpg",
    ])
    expect(effets.removeProductFromIndex).toHaveBeenCalledWith(cible.id)
    expect(effets.revalidateCatalog).toHaveBeenCalledTimes(1)
  })

  it("ne touche aucune ligne quand la liste est vide", async () => {
    const effets = effetsSilencieux()

    expect(await bulkSetFeatured([], true, effets)).toEqual({
      succes: [],
      echecs: [],
    })
    expect(await bulkDelete([], effets)).toEqual({ succes: [], echecs: [] })
    expect(effets.reindexProducts).not.toHaveBeenCalled()
    expect(effets.deleteImages).not.toHaveBeenCalled()
  })
})

describe("la duplication d'un Produit", () => {
  it("copie la fiche et ses Variantes avec un slug et des SKU suffixés, sans aucune image", async () => {
    const source = await creerProduit("origine", {
      images: ["https://cdn.example.test/origine.jpg"],
      stocks: [3, 4],
    })
    const effets = effetsSilencieux()

    const copie = await duplicateProduct(source.id, effets)

    expect(copie.id).not.toBe(source.id)
    expect(copie.slug).toBe(`${prefixe}origine-copie`)
    expect(copie.images).toEqual([])
    expect(copie.categoryId).toBe(racine.id)
    expect(copie.variants.map((variante) => variante.sku)).toEqual([
      `SKU-${prefixe}origine-0-copie`,
      `SKU-${prefixe}origine-1-copie`,
    ])
    expect(copie.variants.map((variante) => variante.stock)).toEqual([3, 4])

    const sourceRelue = await prisma.product.findUnique({
      where: { id: source.id },
    })
    expect(sourceRelue).toMatchObject({ slug: `${prefixe}origine` })
    expect(effets.reindexProducts).toHaveBeenCalledTimes(1)
    expect(effets.revalidateCatalog).toHaveBeenCalledTimes(1)

    const seconde = await duplicateProduct(source.id, effets)
    expect(seconde.slug).toBe(`${prefixe}origine-copie-2`)
    expect(seconde.variants.map((variante) => variante.sku)).toEqual([
      `SKU-${prefixe}origine-0-copie-2`,
      `SKU-${prefixe}origine-1-copie-2`,
    ])
  })

  it("duplique aussi un Produit sans Structure, en gardant sa Structure nulle", async () => {
    const source = await creerProduit("orpheline", { categoryId: null })

    const copie = await duplicateProduct(source.id, effetsSilencieux())

    expect(copie.categoryId).toBeNull()
    expect(copie.slug).toBe(`${prefixe}orpheline-copie`)
  })

  it("refuse un Produit inconnu", async () => {
    await expect(
      duplicateProduct(randomUUID(), effetsSilencieux())
    ).rejects.toThrow("Produit introuvable")
  })
})

describe("les gestes en lot se réindexent avec le nom de la Structure", () => {
  it("passe à l'index un document qui nomme la Structure d'arrivée", async () => {
    const cible = await creerProduit("indexation")
    const effets = effetsSilencieux()

    await bulkSetStructure([cible.id], enfant.id, effets)

    const documents = effets.reindexProducts.mock.calls[0]?.[0]
    expect(documents).toHaveLength(1)
    expect(documents?.[0]).toMatchObject({
      id: cible.id,
      categorySlug: enfant.slug,
      categoryName: enfant.name,
    })
  })
})
