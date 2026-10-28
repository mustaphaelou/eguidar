import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { lirePanierClient } from "@/lib/panier"
import {
  createProduct,
  deleteProduct,
  updateVariantStock,
} from "@/lib/use-cases/admin-catalog"
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/use-cases/admin-structure"
import { chargerDevis, projeterDevis } from "@/lib/use-cases/devis"
import { placeOrder, updateOrderStatus } from "@/lib/use-cases/orders"
import type {
  CatalogEffects,
  ProductInput,
} from "@/lib/use-cases/admin-catalog"
import type { StructureEffects } from "@/lib/use-cases/admin-structure"

const runId = randomUUID().slice(0, 8)
const PREFIXE = `evt-mut-${runId}-`
const email = `${PREFIXE}client@example.test`

let userId = ""
let categoryId = ""
let cityId = ""
let produitId = ""
let variantId = ""

async function evenementsDe(entityId: string) {
  return prisma.automationEvent.findMany({
    where: { entityId },
    orderBy: { seq: "asc" },
  })
}

function inputProduit(suffixe: string): ProductInput {
  return {
    name: `Produit ${suffixe}`,
    slug: `${PREFIXE}${suffixe}`,
    description: "Description",
    brand: "Marque",
    categoryId,
    price: 100000,
    specs: {},
    images: [],
    isFeatured: false,
    featuredOrder: 0,
    freeShipping: false,
    variants: [
      {
        name: "Standard",
        sku: `${PREFIXE}sku-${suffixe}`,
        priceDelta: 0,
        stock: 4,
      },
    ],
  }
}

const EFFETS_COMMANDE = {
  sendOrderPlacedEmail: async () => {},
  sendOrderStatusEmail: async () => {},
  invalidateCommande: () => {},
  invalidateProduits: async () => {},
}

const EFFETS_CATALOGUE: Partial<CatalogEffects> = {
  reindexProducts: async () => {},
  removeProductFromIndex: async () => {},
  revalidateCatalog: () => {},
  deleteImages: async () => {},
}

const EFFETS_STRUCTURE: Partial<StructureEffects> = {
  reindexProducts: async () => {},
  revalidateCategories: () => {},
  deleteImage: async () => {},
}

async function entreeDeCommande() {
  const charge = await chargerDevis(await lirePanierClient(userId))
  const selection = projeterDevis(charge, cityId).selection
  if (selection.cas !== "validée") throw new Error("devis non validé")
  return {
    cityId,
    address: "12 rue du Test",
    phone: "0600000000",
    totalAffiche: selection.devis.total,
  }
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { id: randomUUID(), email, name: "Client Test" },
  })
  userId = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `${PREFIXE}categorie` },
  })
  categoryId = category.id

  const produit = await prisma.product.create({
    data: {
      name: `Produit ${runId}`,
      slug: `${PREFIXE}produit`,
      description: "Description",
      brand: "Marque",
      categoryId,
      price: 100000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `${PREFIXE}sku-fixe`,
            priceDelta: 0,
            stock: 4,
          },
        ],
      },
    },
    include: { variants: true },
  })
  produitId = produit.id
  variantId = produit.variants[0]!.id

  const city = await prisma.deliveryCity.create({
    data: { name: "Ville Test", slug: `${PREFIXE}ville`, fee: 3500 },
  })
  cityId = city.id
})

beforeEach(async () => {
  await prisma.automationEvent.deleteMany({
    where: { OR: [{ entityId: produitId }, { entityId: userId }] },
  })
  await prisma.automationEvent.deleteMany({
    where: { payload: { path: ["snapshot", "userEmail"], equals: email } },
  })
  await prisma.automationEvent.deleteMany({
    where: { entityType: "categorie", entityId: categoryId },
  })
  await prisma.cartItem.deleteMany({ where: { userId } })
  await prisma.orderItem.deleteMany({
    where: { order: { userId } },
  })
  await prisma.order.deleteMany({ where: { userId } })
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock: 4 },
  })
})

afterAll(async () => {
  await prisma.automationEvent.deleteMany({
    where: { entityType: "produit", entityId: produitId },
  })
  await prisma.automationEvent.deleteMany({
    where: { entityType: "categorie" },
  })
  await prisma.automationEvent.deleteMany({
    where: { payload: { path: ["snapshot", "userEmail"], equals: email } },
  })
  await prisma.cartItem.deleteMany({ where: { userId } })
  await prisma.orderItem.deleteMany({ where: { order: { userId } } })
  await prisma.order.deleteMany({ where: { userId } })
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.deliveryCity.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

describe("les mutations écrivent leur événement dans leur transaction", () => {
  it("la prise de Commande écrit commande.creee avec sa charge", async () => {
    await prisma.cartItem.create({
      data: { userId, variantId, quantity: 1 },
    })

    const commande = await placeOrder(
      userId,
      await entreeDeCommande(),
      EFFETS_COMMANDE
    )

    const evenements = await evenementsDe(commande.id)
    expect(evenements).toHaveLength(1)
    expect(evenements[0]!.type).toBe("commande.creee")
    expect(evenements[0]!.entityType).toBe("commande")
    const payload = evenements[0]!.payload as {
      snapshot: { orderId: string; userEmail: string }
    }
    expect(payload.snapshot.orderId).toBe(commande.id)
    expect(payload.snapshot.userEmail).toBe(email)
  })

  it("une Commande refusée ne laisse aucun événement", async () => {
    await expect(
      placeOrder(userId, await entreeDeCommande(), EFFETS_COMMANDE)
    ).rejects.toThrow()
    await expect(
      prisma.automationEvent.count({
        where: {
          type: "commande.creee",
          payload: { path: ["snapshot", "userEmail"], equals: email },
        },
      })
    ).resolves.toBe(0)
  })

  it("un changement de statut écrit commande.statut.changee", async () => {
    await prisma.cartItem.create({
      data: { userId, variantId, quantity: 1 },
    })
    const commande = await placeOrder(
      userId,
      await entreeDeCommande(),
      EFFETS_COMMANDE
    )
    await updateOrderStatus(commande.id, "confirmed", EFFETS_COMMANDE)

    const evenements = await evenementsDe(commande.id)
    expect(evenements.map((evenement) => evenement.type)).toEqual([
      "commande.creee",
      "commande.statut.changee",
    ])
    expect(evenements[1]!.payload).toMatchObject({ statut: "confirmed" })
    expect(evenements.map((evenement) => evenement.seq)).toEqual([1, 2])
  })

  it("l'enregistrement d'un Produit écrit produit.enregistre", async () => {
    const produit = await createProduct(
      inputProduit("catalogue"),
      EFFETS_CATALOGUE
    )

    const evenements = await evenementsDe(produit.id)
    expect(evenements).toHaveLength(1)
    expect(evenements[0]!.type).toBe("produit.enregistre")
    expect(evenements[0]!.payload).toMatchObject({
      produitId: produit.id,
      slug: `${PREFIXE}catalogue`,
    })
  })

  it("la suppression d'un Produit écrit produit.supprime", async () => {
    const produit = await createProduct(
      inputProduit("asupprimer"),
      EFFETS_CATALOGUE
    )
    await deleteProduct(produit.id, EFFETS_CATALOGUE)

    const evenements = await evenementsDe(produit.id)
    expect(evenements.map((evenement) => evenement.type)).toEqual([
      "produit.enregistre",
      "produit.supprime",
    ])
  })

  it("le stock d'une Variante écrit variante.stock.changee dans la transaction", async () => {
    await updateVariantStock(variantId, 2, EFFETS_CATALOGUE)

    const evenements = await evenementsDe(produitId)
    expect(evenements).toHaveLength(1)
    expect(evenements[0]!.type).toBe("variante.stock.changee")
    expect(evenements[0]!.payload).toEqual({ produitId })
  })

  it("les mutations de Structure écrivent leur événement", async () => {
    const creee = await createCategory(
      { name: "Structure Test", slug: `${PREFIXE}structure` },
      EFFETS_STRUCTURE
    )
    await updateCategory(
      creee.id,
      { name: "Structure Test 2", slug: creee.slug },
      EFFETS_STRUCTURE
    )
    await deleteCategory(creee.id, {}, EFFETS_STRUCTURE)

    const evenements = await evenementsDe(creee.id)
    expect(evenements.map((evenement) => evenement.type)).toEqual([
      "structure.creee",
      "structure.modifiee",
      "structure.supprimee",
    ])
  })
})
