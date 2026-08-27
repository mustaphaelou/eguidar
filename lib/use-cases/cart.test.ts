import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { lirePanier } from "@/lib/panier"
import {
  addToCart,
  CartItemNotFoundError,
  CartValidationError,
  CartVariantNotFoundError,
  removeCartItem,
  updateCartItemQuantity,
} from "@/lib/use-cases/cart"

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `cart-${runId}-${suffix}@test.ma`

let userIdA: string
let userIdB: string
let variantA: string
let variantB: string
let variantC: string

async function createUser(suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: { id: randomUUID(), email: email(suffix), name: `Utilisateur ${suffix}` },
  })
  return user.id
}

beforeAll(async () => {
  userIdA = await createUser("a")
  userIdB = await createUser("b")

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `cart-cat-${runId}` },
  })
  const [productA, productB] = await Promise.all([
    prisma.product.create({
      data: {
        name: "Produit Cart A",
        slug: `cart-prod-a-${runId}`,
        description: "Description A",
        brand: "Marque Cart",
        categoryId: category.id,
        price: 100000,
        specs: {},
        images: ["https://example.com/a.jpg"],
        freeShipping: false,
        variants: {
          create: [
            { name: "Standard", sku: `CART-${runId}-A1`, priceDelta: 0, stock: 10 },
            { name: "Premium", sku: `CART-${runId}-A2`, priceDelta: 50000, stock: 3 },
          ],
        },
      },
      include: { variants: true },
    }),
    prisma.product.create({
      data: {
        name: "Produit Cart B",
        slug: `cart-prod-b-${runId}`,
        description: "Description B",
        brand: "Marque Cart",
        categoryId: category.id,
        price: 50000,
        specs: {},
        images: ["https://example.com/b.jpg"],
        freeShipping: true,
        variants: {
          create: [{ name: "Standard", sku: `CART-${runId}-B1`, priceDelta: 0, stock: 5 }],
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
    where: { user: { email: { startsWith: `cart-${runId}-` } } },
  })
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `cart-${runId}-` } } },
  })
  await prisma.user.deleteMany({ where: { email: { startsWith: `cart-${runId}-` } } })
  await prisma.product.deleteMany({ where: { slug: { endsWith: `-${runId}` } } })
  await prisma.category.deleteMany({ where: { slug: `cart-cat-${runId}` } })
  await prisma.$disconnect()
})

describe("cart mutations", () => {
  it("adds an item and merges quantities on a second add", async () => {
    await addToCart(userIdA, variantA, 2)
    await addToCart(userIdA, variantA, 3)

    const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })
    expect(item.quantity).toBe(5)
  })

  it("rejects an invalid quantity", async () => {
    await expect(addToCart(userIdA, variantA, 0)).rejects.toThrow(CartValidationError)
    await expect(addToCart(userIdA, variantA, -1)).rejects.toThrow(CartValidationError)
    await expect(addToCart(userIdA, variantA, 1.5)).rejects.toThrow(CartValidationError)
  })

  it("rejects an unknown variant", async () => {
    await expect(addToCart(userIdA, "variante-inconnue", 1)).rejects.toThrow(
      CartVariantNotFoundError
    )
  })

  it("updates the quantity of an owned item", async () => {
    await addToCart(userIdA, variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

    await updateCartItemQuantity(userIdA, item.id, 4)

    const updated = await prisma.cartItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(updated.quantity).toBe(4)
  })

  it("rejects updating an item that belongs to another user", async () => {
    await addToCart(userIdA, variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

    await expect(updateCartItemQuantity(userIdB, item.id, 2)).rejects.toThrow(
      CartItemNotFoundError
    )
  })

  it("rejects updating with an invalid quantity", async () => {
    await addToCart(userIdA, variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

    await expect(updateCartItemQuantity(userIdA, item.id, 0)).rejects.toThrow(CartValidationError)
  })

  it("removes an item", async () => {
    await addToCart(userIdA, variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

    await removeCartItem(userIdA, item.id)

    const count = await prisma.cartItem.count({ where: { userId: userIdA } })
    expect(count).toBe(0)
  })

  it("rejects removing an item that belongs to another user", async () => {
    await addToCart(userIdA, variantA, 1)
    const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

    await expect(removeCartItem(userIdB, item.id)).rejects.toThrow(CartItemNotFoundError)
  })
})

describe("cart reads", () => {
  it("returns line items with unit prices, totals and subtotal", async () => {
    await addToCart(userIdA, variantA, 2)
    await addToCart(userIdA, variantB, 1)
    await addToCart(userIdA, variantC, 3)

    const cart = await lirePanier({ role: "client", compteId: userIdA })

    expect(cart.itemCount).toBe(6)
    expect(cart.subtotal).toBe(100000 * 2 + 150000 + 50000 * 3)
    expect(cart.lines).toHaveLength(3)
    expect(cart.lines[0]).toMatchObject({
      variantName: "Standard",
      unitPrice: 100000,
      quantity: 2,
      lineTotal: 200000,
      stock: 10,
      freeShipping: false,
      productName: "Produit Cart A",
      image: "https://example.com/a.jpg",
    })
    expect(cart.lines[1]).toMatchObject({ variantName: "Premium", unitPrice: 150000, quantity: 1 })
    expect(cart.lines[2]).toMatchObject({ variantName: "Standard", unitPrice: 50000, quantity: 3, freeShipping: true })
  })

  it("returns an empty cart with zero totals", async () => {
    const proprietaire = { role: "client", compteId: userIdB } as const
    const cart = await lirePanier(proprietaire)
    expect(cart).toEqual({ proprietaire, lines: [], subtotal: 0, itemCount: 0 })
  })
})
