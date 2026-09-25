import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import {
  specificationsProduit,
  totalVariantStock,
  urlsImagesProduit,
} from "@/lib/product-metrics"
import {
  getAdminProduct,
  listAdminCategories,
  listAdminProducts,
} from "@/lib/use-cases/admin-catalog"

const runId = randomUUID().slice(0, 8)
const slug = (suffix: string) => `p-${runId}-${suffix}`

/**
 * Colonnes `images` et `specs` stockées hors de leur forme : une galerie
 * qui n'est pas un tableau, des spécifications qui ne sont pas une série
 * d'entrées. Les deux fixtures sont partagées par tous les tests qui
 * épinglent une colonne malformée — la lecture d'édition d'un Produit les
 * reprend telles quelles.
 */
const GALERIE_HORS_FORME = { url: "https://cdn.example.com/pas-un-tableau.jpg" }
const SPECS_HORS_FORME = "Écran : 6 pouces"

interface RecetteProduit {
  name?: string
  brand?: string
  price?: number
  isFeatured?: boolean
  freeShipping?: boolean
  /** Les colonnes JSON telles qu'elles sont stockées : cette suite écrit
   * volontairement des valeurs hors de leur forme, que la mutation refuse. */
  images?: Prisma.InputJsonValue
  specs?: Prisma.InputJsonValue
  variants?: { name: string; stock: number; priceDelta?: number }[]
}

let categoryId: string

/** Un Produit écrit directement en base : la suite épingle la lecture, pas
 * la mutation, et une colonne malformée n'est pas écrivable par elle. */
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
  return (await listAdminProducts()).find((produit) => produit.id === id)
}

// Les trois lectures partagent la même recette : une catégorie, et des
// Produits que la suite écrit puis efface entre chaque épinglage.
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
    })
  })

  it("liste les Produits du plus récemment modifié au plus ancien", async () => {
    const ancien = await creerProduit("ordre-1")
    const recent = await creerProduit("ordre-2")
    // Seule une écriture change la date de mise à jour : sans elle, les deux
    // créations se suivent et l'ordre ne prouverait rien du tri.
    await prisma.product.update({
      where: { id: ancien.id },
      data: { name: "Touche" },
    })

    const ids = (await listAdminProducts())
      .map((produit) => produit.id)
      .filter((id) => id === ancien.id || id === recent.id)

    expect(ids).toEqual([ancien.id, recent.id])
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

  it("répond une galerie et un enregistrement vides pour des colonnes hors de leur forme", async () => {
    const produit = await creerProduit("colonnes-hors-forme", {
      images: GALERIE_HORS_FORME,
      specs: SPECS_HORS_FORME,
    })

    expect(await faitProduit(produit.id)).toMatchObject({ image: null })
    // Les deux faits canoniques que compose toute lecture de ces colonnes, et
    // que la lecture d'édition compose des mêmes fixtures.
    expect(urlsImagesProduit(GALERIE_HORS_FORME)).toEqual([])
    expect(specificationsProduit(SPECS_HORS_FORME)).toEqual({})
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
      specs: { Écran: '6,1 pouces', Connectique: "USB-C, mini Jack" },
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

    // Un éditeur voit un formulaire complet, dont deux champs vides : les
    // faits complets du formulaire, moins ce que les colonnes ne savent pas
    // dire. Le même verdict que porte la lecture de liste, sur les mêmes
    // fixtures — et non un éditeur cassé.
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

describe("catégories du formulaire Produit", () => {
  it("répond exactement l'identifiant et le nom, rien d'autre", async () => {
    const categories = await listAdminCategories()

    expect(
      categories.find((categorie) => categorie.id === categoryId)
    ).toEqual({ id: categoryId, name: "Catégorie Test lecture" })
    // Le sélecteur ne reçoit rien d'autre : un fait de plus ferait échouer
    // cette épinglage, catégorie par catégorie.
    for (const categorie of categories) {
      expect(Object.keys(categorie).sort()).toEqual(["id", "name"])
    }
  })
})
