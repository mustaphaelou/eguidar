import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  ajouterArticleAuPanier,
  lirePanier,
  modifierQuantiteArticlePanier,
  retirerArticleDuPanier,
} from "@/lib/panier"

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `panier-client-${runId}-${suffix}@test.ma`

let userIdA: string
let userIdB: string
let variantA: string
let variantB: string
let variantC: string

async function createUser(suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: email(suffix),
      name: `Utilisateur ${suffix}`,
    },
  })
  return user.id
}

function clientOwner(userId: string) {
  return { role: "client" as const, compteId: userId }
}

beforeAll(async () => {
  userIdA = await createUser("a")
  userIdB = await createUser("b")

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `panier-client-cat-${runId}` },
  })
  const [productA, productB] = await Promise.all([
    prisma.product.create({
      data: {
        name: "Produit Panier A",
        slug: `panier-client-prod-a-${runId}`,
        description: "Description A",
        brand: "Marque Panier",
        categoryId: category.id,
        price: 100000,
        specs: {},
        images: ["https://example.com/a.jpg"],
        freeShipping: false,
        variants: {
          create: [
            {
              name: "Standard",
              sku: `PANIER-${runId}-A1`,
              priceDelta: 0,
              stock: 10,
            },
            {
              name: "Premium",
              sku: `PANIER-${runId}-A2`,
              priceDelta: 50000,
              stock: 3,
            },
          ],
        },
      },
      include: { variants: true },
    }),
    prisma.product.create({
      data: {
        name: "Produit Panier B",
        slug: `panier-client-prod-b-${runId}`,
        description: "Description B",
        brand: "Marque Panier",
        categoryId: category.id,
        price: 50000,
        specs: {},
        images: ["https://example.com/b.jpg"],
        freeShipping: true,
        variants: {
          create: [
            {
              name: "Standard",
              sku: `PANIER-${runId}-B1`,
              priceDelta: 0,
              stock: 5,
            },
          ],
        },
      },
      include: { variants: true },
    }),
  ])
  variantA = productA.variants.find((v) => v.name === "Standard")!.id
  variantB = productA.variants.find((v) => v.name === "Premium")!.id
  variantC = productB.variants[0].id
})

beforeEach(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `panier-client-${runId}-` } } },
  })
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `panier-client-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `panier-client-${runId}-` } },
  })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `panier-client-prod-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: `panier-client-cat-${runId}` },
  })
  await prisma.$disconnect()
})

describe("mutations du Panier client — lib/panier", () => {
  it("answers ok and merges the quantities of an article added twice", async () => {
    expect(
      await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 2)
    ).toEqual({ ok: true })
    expect(
      await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 3)
    ).toEqual({ ok: true })

    const item = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdA },
    })
    expect(item.quantity).toBe(5)
  })

  it("refuses an invalid quantity with the quantite-invalide motif and persists nothing", async () => {
    expect(
      await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 0)
    ).toEqual({ ok: false, motif: "quantite-invalide" })
    expect(
      await ajouterArticleAuPanier(clientOwner(userIdA), variantA, -1)
    ).toEqual({ ok: false, motif: "quantite-invalide" })
    expect(
      await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 1.5)
    ).toEqual({ ok: false, motif: "quantite-invalide" })

    expect(await prisma.cartItem.count({ where: { userId: userIdA } })).toBe(0)
  })

  it("refuses an unknown variant with the variante-inconnue motif", async () => {
    expect(
      await ajouterArticleAuPanier(clientOwner(userIdA), "variante-inconnue", 1)
    ).toEqual({ ok: false, motif: "variante-inconnue" })
  })

  it("answers ok when updating the quantity of an owned article", async () => {
    await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdA },
    })

    expect(
      await modifierQuantiteArticlePanier(clientOwner(userIdA), item.id, 4)
    ).toEqual({ ok: true })

    const updated = await prisma.cartItem.findUniqueOrThrow({
      where: { id: item.id },
    })
    expect(updated.quantity).toBe(4)
  })

  it("refuses updating another account's article with the article-inconnu motif", async () => {
    await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdA },
    })

    expect(
      await modifierQuantiteArticlePanier(clientOwner(userIdB), item.id, 2)
    ).toEqual({ ok: false, motif: "article-inconnu" })
  })

  it("refuses updating with an invalid quantity even for an unknown article (quantite first)", async () => {
    await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdA },
    })

    expect(
      await modifierQuantiteArticlePanier(clientOwner(userIdA), item.id, 0)
    ).toEqual({ ok: false, motif: "quantite-invalide" })
  })

  it("answers ok when removing an article", async () => {
    await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdA },
    })

    expect(await retirerArticleDuPanier(clientOwner(userIdA), item.id)).toEqual(
      {
        ok: true,
      }
    )

    const count = await prisma.cartItem.count({ where: { userId: userIdA } })
    expect(count).toBe(0)
  })

  it("refuses removing another account's article with the article-inconnu motif", async () => {
    await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({
      where: { userId: userIdA },
    })

    expect(await retirerArticleDuPanier(clientOwner(userIdB), item.id)).toEqual(
      {
        ok: false,
        motif: "article-inconnu",
      }
    )
  })
})

describe("lectures du Panier client — lirePanier", () => {
  it("retourne les articles avec prix unitaires, totaux et sous-total", async () => {
    await ajouterArticleAuPanier(clientOwner(userIdA), variantA, 2)
    await ajouterArticleAuPanier(clientOwner(userIdA), variantB, 1)
    await ajouterArticleAuPanier(clientOwner(userIdA), variantC, 3)

    const panier = await lirePanier(clientOwner(userIdA))

    expect(panier.itemCount).toBe(6)
    expect(panier.subtotal).toBe(100000 * 2 + 150000 + 50000 * 3)
    expect(panier.lines).toHaveLength(3)
    expect(panier.lines[0]).toMatchObject({
      variantName: "Standard",
      unitPrice: 100000,
      quantity: 2,
      lineTotal: 200000,
      stock: 10,
      freeShipping: false,
      productName: "Produit Panier A",
      image: "https://example.com/a.jpg",
    })
    expect(panier.lines[1]).toMatchObject({
      variantName: "Premium",
      unitPrice: 150000,
      quantity: 1,
    })
    expect(panier.lines[2]).toMatchObject({
      variantName: "Standard",
      unitPrice: 50000,
      quantity: 3,
      freeShipping: true,
    })
  })

  it("returns an empty Panier with zero totals", async () => {
    const proprietaire = { role: "client", compteId: userIdB } as const
    const panier = await lirePanier(proprietaire)
    expect(panier).toEqual({
      proprietaire,
      lines: [],
      subtotal: 0,
      itemCount: 0,
    })
  })
})
