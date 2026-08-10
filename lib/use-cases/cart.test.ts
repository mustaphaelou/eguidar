import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  addToCart,
  CartItemNotFoundError,
  CartValidationError,
  CartVariantNotFoundError,
  computeShippingFee,
  getCart,
  getCartShippingQuote,
  listDeliveryCities,
  removeCartItem,
  updateCartItemQuantity,
} from "@/lib/use-cases/cart"

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `cart-${runId}-${suffix}@test.ma`
const cityName = `Ville ${runId}`

let userIdA: string
let userIdB: string
let variantA: string
let variantB: string
let variantC: string
let variantD: string
let cityId: string

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
  const [productA, productB, productC] = await Promise.all([
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
    prisma.product.create({
      data: {
        name: "Produit Cart C",
        slug: `cart-prod-c-${runId}`,
        description: "Description C",
        brand: "Marque Cart",
        categoryId: category.id,
        price: 30000,
        specs: {},
        images: ["https://example.com/c.jpg"],
        freeShipping: false,
        variants: {
          create: [{ name: "Standard", sku: `CART-${runId}-C1`, priceDelta: 0, stock: 5 }],
        },
      },
      include: { variants: true },
    }),
  ])
  variantA = productA.variants.find((v) => v.name === "Standard")!.id
  variantB = productA.variants.find((v) => v.name === "Premium")!.id
  variantC = productB.variants[0].id
  variantD = productC.variants[0].id

  const city = await prisma.deliveryCity.create({ data: { name: cityName, fee: 3500 } })
  cityId = city.id
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
  await prisma.deliveryCity.deleteMany({ where: { name: cityName } })
  await prisma.$disconnect()
})

describe("shipping fee rule", () => {
  it("charges the city fee below the threshold when nothing is free-shipping", () => {
    expect(computeShippingFee({ subtotal: 50000, cityFee: 3500, freeShippingThreshold: 100000, anyFreeShippingItem: false })).toBe(3500)
  })

  it("is free exactly at the threshold", () => {
    expect(computeShippingFee({ subtotal: 100000, cityFee: 3500, freeShippingThreshold: 100000, anyFreeShippingItem: false })).toBe(0)
  })

  it("is free above the threshold", () => {
    expect(computeShippingFee({ subtotal: 150000, cityFee: 3500, freeShippingThreshold: 100000, anyFreeShippingItem: false })).toBe(0)
  })

  it("is free below the threshold when every item is free-shipping flagged", () => {
    expect(computeShippingFee({ subtotal: 50000, cityFee: 3500, freeShippingThreshold: 100000, anyFreeShippingItem: true })).toBe(0)
  })

  it("is free below the threshold when at least one item is free-shipping flagged", () => {
    expect(computeShippingFee({ subtotal: 80000, cityFee: 3500, freeShippingThreshold: 100000, anyFreeShippingItem: true })).toBe(0)
  })

  it("is free for a zero subtotal (no city fee on an empty cart)", () => {
    expect(computeShippingFee({ subtotal: 0, cityFee: 3500, freeShippingThreshold: 100000, anyFreeShippingItem: true })).toBe(0)
  })
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

    const cart = await getCart(userIdA)

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
    const cart = await getCart(userIdB)
    expect(cart).toEqual({ lines: [], subtotal: 0, itemCount: 0 })
  })

  it("quotes the shipping fee for a chosen city below the threshold", async () => {
    await addToCart(userIdA, variantD, 1)
    const quote = await getCartShippingQuote(userIdA, cityId)
    expect(quote).toEqual({ subtotal: 30000, shippingFee: 3500, total: 33500 })
  })

  it("quotes free shipping for an all-free-shipping cart below the threshold", async () => {
    await addToCart(userIdA, variantC, 1)
    const quote = await getCartShippingQuote(userIdA, cityId)
    expect(quote).toEqual({ subtotal: 50000, shippingFee: 0, total: 50000 })
  })

  it("quotes free shipping for a mixed cart with one free-shipping item below the threshold", async () => {
    await addToCart(userIdA, variantC, 1)
    await addToCart(userIdA, variantD, 1)
    const quote = await getCartShippingQuote(userIdA, cityId)
    expect(quote).toEqual({ subtotal: 80000, shippingFee: 0, total: 80000 })
  })

  it("quotes free shipping for a cart above the threshold", async () => {
    await addToCart(userIdA, variantA, 20)
    const quote = await getCartShippingQuote(userIdA, cityId)
    expect(quote).toEqual({ subtotal: 2000000, shippingFee: 0, total: 2000000 })
  })

  it("returns null for an unknown delivery city", async () => {
    await addToCart(userIdA, variantA, 1)
    await expect(getCartShippingQuote(userIdA, "ville-inconnue")).resolves.toBeNull()
  })

  it("lists delivery cities ordered by name", async () => {
    const cities = await listDeliveryCities()
    expect(cities.length).toBeGreaterThan(0)
    const names = cities.map((city) => city.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(cities.some((city) => city.id === cityId && city.fee === 3500)).toBe(true)
  })
})
