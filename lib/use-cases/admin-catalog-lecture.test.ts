import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import { totalVariantStock } from "@/lib/product-metrics"
import { LIBELLE_SANS_STRUCTURE } from "@/lib/index-projection"
import {
  getAdminProduct,
  listAdminProducts,
  updateProduct,
} from "@/lib/use-cases/admin-catalog"
import { createCategory } from "@/lib/use-cases/admin-structure"
import { lireStructure } from "@/lib/use-cases/lecture-structure"

const runId = randomUUID().slice(0, 8)
const slug = (suffix: string) => `p-${runId}-${suffix}`

const GALERIE_HORS_FORME = { url: "https://cdn.example.com/pas-un-tableau.jpg" }
const SPECS_HORS_FORME = "Écran : 6 pouces"

const SPECS_A_MOITIE_CREDIBLES = { Écran: "6", Poids: 200 }

interface RecetteProduit {
  name?: string
  brand?: string
  price?: number
  isFeatured?: boolean
  freeShipping?: boolean
  images?: Prisma.InputJsonValue
  specs?: Prisma.InputJsonValue
  creeLe?: string
  variants?: { name: string; stock: number; priceDelta?: number }[]
}

let categoryId: string

function creerProduit(suffix: string, recette: RecetteProduit = {}) {
  const variantes = recette.variants ?? [{ name: "Standard", stock: 5 }]
  return prisma.product.create({
    data: {
      name: recette.name ?? "Produit de recette",
      slug: slug(suffix),
      description: "Une description de test",
      brand: recette.brand ?? "Marque Test",
      categoryId,
      price: recette.price ?? 100000,
      specs: recette.specs ?? { Écran: "6 pouces" },
      images: recette.images ?? ["https://cdn.example.com/une.jpg"],
      createdAt: recette.creeLe ? new Date(recette.creeLe) : undefined,
      isFeatured: recette.isFeatured ?? false,
      featuredOrder: 0,
      freeShipping: recette.freeShipping ?? false,
      variants: {
        create: variantes.map((variante, index) => ({
          name: variante.name,
          sku: `SKU-${runId}-${suffix}-${index}`,
          priceDelta: variante.priceDelta ?? 0,
          stock: variante.stock,
        })),
      },
    },
    include: { variants: true },
  })
}

async function faitProduit(id: string) {
  return (await listAdminProducts({ q: runId })).produits.find(
    (produit) => produit.id === id
  )
}

beforeAll(async () => {
  const categorie = await prisma.category.create({
    data: {
      name: "Catégorie Test lecture",
      slug: `categorie-lecture-${runId}`,
    },
  })
  categoryId = categorie.id
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
  await prisma.category.deleteMany({
    where: { slug: `categorie-lecture-${runId}` },
  })
  await prisma.$disconnect()
})

describe("liste des Produits de l'Administration", () => {
  it("répond les seuls faits que la liste rend, ni la galerie ni les Variantes", async () => {
    const produit = await creerProduit("faits", {
      name: "Chaise",
      brand: "Marque Chaise",
      price: 120000,
      isFeatured: true,
      freeShipping: true,
      images: [
        "https://cdn.example.com/premiere.jpg",
        "https://cdn.example.com/seconde.jpg",
      ],
    })

    expect(await faitProduit(produit.id)).toEqual({
      id: produit.id,
      name: "Chaise",
      brand: "Marque Chaise",
      categoryName: "Catégorie Test lecture",
      price: 120000,
      isFeatured: true,
      freeShipping: true,
      image: "https://cdn.example.com/premiere.jpg",
      totalStock: 5,
      createdAt: produit.createdAt,
    })
  })

  it("liste les Produits de la création la plus récente à la plus ancienne", async () => {
    const ancien = await creerProduit("ordre-1", {
      creeLe: "2026-01-01T10:00:00.000Z",
    })
    const recent = await creerProduit("ordre-2", {
      creeLe: "2026-02-01T10:00:00.000Z",
    })
    await prisma.product.update({
      where: { id: ancien.id },
      data: { name: "Touche" },
    })

    const ids = (await listAdminProducts({ q: runId, tri: "date" })).produits
      .map((produit) => produit.id)
      .filter((id) => id === ancien.id || id === recent.id)

    expect(ids).toEqual([recent.id, ancien.id])
  })

  it("compose le stock total depuis le fait canonique des Variantes", async () => {
    const produit = await creerProduit("stock", {
      variants: [
        { name: "128 Go", stock: 7 },
        { name: "256 Go", stock: 3 },
        { name: "512 Go", stock: 0 },
      ],
    })
    const variantes = await prisma.productVariant.findMany({
      where: { productId: produit.id },
    })

    const fait = await faitProduit(produit.id)

    expect(fait?.totalStock).toBe(totalVariantStock(variantes))
    expect(fait?.totalStock).toBe(10)
  })

  it("répond un stock total nul pour un Produit sans Variante", async () => {
    const produit = await creerProduit("stock-nul", { variants: [] })

    expect((await faitProduit(produit.id))?.totalStock).toBe(0)
  })

  it("retient la première URL lisible d'une galerie à moitié écrite", async () => {
    const produit = await creerProduit("galerie-partielle", {
      images: [
        42,
        "https://cdn.example.com/premiere.jpg",
        null,
        "https://cdn.example.com/seconde.jpg",
      ],
    })

    expect((await faitProduit(produit.id))?.image).toBe(
      "https://cdn.example.com/premiere.jpg"
    )
  })

  it("liste un Produit dont la galerie stockée n'est pas un tableau", async () => {
    const produit = await creerProduit("galerie-hors-forme", {
      name: "Produit aux colonnes abimées",
      images: GALERIE_HORS_FORME,
      specs: SPECS_HORS_FORME,
    })

    const fait = await faitProduit(produit.id)

    expect(fait).toBeDefined()
    expect(fait?.image).toBeNull()
    expect(fait?.name).toBe("Produit aux colonnes abimées")
    expect(fait?.totalStock).toBe(5)
  })
})

describe("édition d'un Produit de l'Administration", () => {
  it("répond les faits complets du formulaire, Variantes projetées comprises", async () => {
    const produit = await creerProduit("edition", {
      name: "Casque",
      brand: "Marque Casque",
      price: 249900,
      isFeatured: true,
      freeShipping: true,
      specs: { Écran: "6,1 pouces", Connectique: "USB-C, mini Jack" },
      images: [
        "https://cdn.example.com/premiere.jpg",
        "https://cdn.example.com/seconde.jpg",
      ],
      variants: [
        { name: "128 Go", stock: 7, priceDelta: 0 },
        { name: "512 Go", stock: 3, priceDelta: 2500 },
      ],
    })

    expect(await getAdminProduct(produit.id)).toEqual({
      id: produit.id,
      name: "Casque",
      slug: slug("edition"),
      brand: "Marque Casque",
      categoryId,
      description: "Une description de test",
      price: 249900,
      isFeatured: true,
      featuredOrder: 0,
      freeShipping: true,
      specs: { Écran: "6,1 pouces", Connectique: "USB-C, mini Jack" },
      images: [
        { kind: "persistee", url: "https://cdn.example.com/premiere.jpg" },
        { kind: "persistee", url: "https://cdn.example.com/seconde.jpg" },
      ],
      variants: [
        {
          id: produit.variants[0].id,
          name: "128 Go",
          sku: `SKU-${runId}-edition-0`,
          priceDelta: 0,
          stock: 7,
        },
        {
          id: produit.variants[1].id,
          name: "512 Go",
          sku: `SKU-${runId}-edition-1`,
          priceDelta: 2500,
          stock: 3,
        },
      ],
    })
  })

  it("ouvre un Produit dont la galerie et les spécifications stockées sont hors de leur forme", async () => {
    const produit = await creerProduit("edition-hors-forme", {
      images: GALERIE_HORS_FORME,
      specs: SPECS_HORS_FORME,
    })

    expect(await getAdminProduct(produit.id)).toEqual({
      id: produit.id,
      name: "Produit de recette",
      slug: slug("edition-hors-forme"),
      brand: "Marque Test",
      categoryId,
      description: "Une description de test",
      price: 100000,
      isFeatured: false,
      featuredOrder: 0,
      freeShipping: false,
      specs: {},
      images: [],
      variants: [
        {
          id: produit.variants[0].id,
          name: "Standard",
          sku: `SKU-${runId}-edition-hors-forme-0`,
          priceDelta: 0,
          stock: 5,
        },
      ],
    })
  })

  it("ouvre un Produit dont les spécifications stockées ne sont qu'à moitié crédibles avec un champ vide", async () => {
    const produit = await creerProduit("edition-specs-a-moitie", {
      specs: SPECS_A_MOITIE_CREDIBLES,
    })

    const faits = await getAdminProduct(produit.id)

    expect(faits?.specs).toEqual({})
    expect(faits).toMatchObject({
      name: "Produit de recette",
      slug: slug("edition-specs-a-moitie"),
      specs: {},
      images: [{ kind: "persistee", url: "https://cdn.example.com/une.jpg" }],
    })
  })

  it("répond un Produit sans Variante, la règle du minimum de Variante n'appartient pas à la lecture", async () => {
    const produit = await creerProduit("edition-sans-variante", {
      variants: [],
    })

    expect((await getAdminProduct(produit.id))?.variants).toEqual([])
  })

  it("répond null pour un identifiant inconnu, pour que l'appelant garde sa décision d'introuvable", async () => {
    expect(await getAdminProduct(randomUUID())).toBeNull()
  })
})

describe("un Produit sans Structure reste lisible par l'Administration", () => {
  it("porte le libellé de la valeur réservée dans la liste des Produits", async () => {
    const orphelin = await prisma.product.create({
      data: {
        name: "Produit sans Structure",
        slug: slug("sans-structure"),
        description: "desc",
        brand: "Marque Test",
        categoryId: null,
        price: 100000,
        specs: {},
        images: [],
      },
    })

    const fait = await faitProduit(orphelin.id)

    expect(fait?.categoryName).toBe(LIBELLE_SANS_STRUCTURE)
  })

  it("s'ouvre dans le formulaire, mais ne s'enregistre pas tant qu'aucune Structure n'est choisie", async () => {
    const orphelin = await prisma.product.create({
      data: {
        name: "Produit sans Structure",
        slug: slug("sans-structure-edition"),
        description: "desc",
        brand: "Marque Test",
        categoryId: null,
        price: 100000,
        specs: {},
        images: [],
      },
    })

    const faits = await getAdminProduct(orphelin.id)
    expect(faits?.categoryId).toBeNull()

    const entree = {
      ...faits!,
      images: faits!.images.map((image) =>
        image.kind === "persistee" ? image.url : image.previewUrl
      ),
    }

    await expect(
      updateProduct(orphelin.id, { ...entree, price: 120000, categoryId: "" })
    ).rejects.toThrow("catégorie requise")

    await expect(
      prisma.product.findUnique({ where: { id: orphelin.id } })
    ).resolves.toMatchObject({ price: 100000, categoryId: null })

    await updateProduct(orphelin.id, {
      ...entree,
      price: 120000,
      categoryId,
    })
    await expect(
      prisma.product.findUnique({ where: { id: orphelin.id } })
    ).resolves.toMatchObject({ price: 120000, categoryId })
  })
})

describe("le sélecteur de Structure des formulaires Produit", () => {
  it("répond exactement l'identifiant et le nom, rien d'autre", async () => {
    const categories = (await lireStructure()).options()

    expect(categories.find((categorie) => categorie.id === categoryId)).toEqual(
      { id: categoryId, name: "Catégorie Test lecture" }
    )
    for (const categorie of categories) {
      expect(Object.keys(categorie).sort()).toEqual(["id", "name"])
    }
  })

  it("porte une Structure créée dans l'Administration dès la lecture suivante", async () => {
    const avant = (await lireStructure()).options()

    const creee = await createCategory({
      name: "Structure fraîche",
      slug: `categorie-fraiche-${runId}`,
    })

    try {
      expect(avant.map((option) => option.id)).not.toContain(creee.id)
      const apres = (await lireStructure()).options()
      expect(apres.find((option) => option.id === creee.id)).toEqual({
        id: creee.id,
        name: "Structure fraîche",
      })
    } finally {
      await prisma.category.delete({ where: { id: creee.id } })
    }
  })
})
