import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import { ajouterArticleAuPanier } from "@/lib/panier"
import { getAdminOrder, listAdminOrders } from "@/lib/use-cases/admin-orders"
import { OrderNotFoundError, placeOrder, updateOrderStatus } from "@/lib/use-cases/orders"
import type { OrderEffects } from "@/lib/use-cases/order-effects"

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `admin-orders-${runId}-${suffix}@test.ma`
const cityName = `Ville admin ${runId}`
const ADDRESS = "12 Avenue Hassan II, Appt 5"
const PHONE = "+212 600 123 456"

let userIdA: string
let userIdB: string
let variantP1: string
let variantP2: string
let cityId: string

function makeEffects(): OrderEffects & {
  sendOrderPlacedEmail: ReturnType<typeof vi.fn>
  sendOrderStatusEmail: ReturnType<typeof vi.fn>
} {
  return {
    sendOrderPlacedEmail: vi.fn<OrderEffects["sendOrderPlacedEmail"]>(async () => {}),
    sendOrderStatusEmail: vi.fn<OrderEffects["sendOrderStatusEmail"]>(async () => {}),
  }
}

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
    data: { name: `Catégorie admin ${runId}`, slug: `admin-orders-cat-${runId}` },
  })
  const product = await prisma.product.create({
    data: {
      name: "Admin Ordres Produit A",
      slug: `admin-orders-prod-a-${runId}`,
      description: "Description A",
      brand: "Marque Admin",
      categoryId: category.id,
      price: 50000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          { name: "Standard", sku: `ADMIN-${runId}-A1`, priceDelta: 0, stock: 5 },
          { name: "Premium", sku: `ADMIN-${runId}-A2`, priceDelta: 10000, stock: 3 },
        ],
      },
    },
    include: { variants: true },
  })
  variantP1 = product.variants.find((v) => v.name === "Standard")!.id
  variantP2 = product.variants.find((v) => v.name === "Premium")!.id

  const city = await prisma.deliveryCity.create({ data: { name: cityName, fee: 3500 } })
  cityId = city.id
})

beforeEach(async () => {
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email: { startsWith: `admin-orders-${runId}-` } } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
  })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
  })
  await prisma.productVariant.updateMany({
    where: { sku: { startsWith: `ADMIN-${runId}-` } },
    data: { stock: { set: 0 } },
  })
  await prisma.productVariant.updateMany({
    where: { sku: `ADMIN-${runId}-A1` },
    data: { stock: { set: 5 } },
  })
  await prisma.productVariant.updateMany({
    where: { sku: `ADMIN-${runId}-A2` },
    data: { stock: { set: 3 } },
  })
})

afterAll(async () => {
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email: { startsWith: `admin-orders-${runId}-` } } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
  })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
  })
  await prisma.user.deleteMany({ where: { email: { startsWith: `admin-orders-${runId}-` } } })
  await prisma.product.deleteMany({ where: { slug: { endsWith: `-${runId}` } } })
  await prisma.category.deleteMany({ where: { slug: `admin-orders-cat-${runId}` } })
  await prisma.deliveryCity.deleteMany({ where: { name: cityName } })
  await prisma.$disconnect()
})

async function createOrder(userId: string, items: { variantId: string; quantity: number }[]): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId,
      cityName,
      address: ADDRESS,
      phone: PHONE,
      total: items.reduce(
        (sum, item) => sum + 50000 * item.quantity + (item.variantId === variantP2 ? 10000 * item.quantity : 0),
        0
      ),
      shippingFee: 3500,
      items: {
        create: items.map((item) => ({
          variantId: item.variantId,
          productName: "Admin Ordres Produit A",
          variantName: item.variantId === variantP2 ? "Premium" : "Standard",
          price: 50000 + (item.variantId === variantP2 ? 10000 : 0),
          quantity: item.quantity,
        })),
      },
    },
  })
  return order.id
}

describe("admin order reads", () => {
  it("lists all orders with status, customer, totals and date, newest first", async () => {
    const firstId = await createOrder(userIdA, [{ variantId: variantP1, quantity: 2 }])
    const secondId = await createOrder(userIdB, [{ variantId: variantP1, quantity: 1 }])

    const orders = await listAdminOrders()

    expect(orders.map((order) => order.id)).toEqual([secondId, firstId])
    expect(orders[1]).toMatchObject({
      status: "pending",
      total: 100000,
      shippingFee: 3500,
      itemCount: 2,
      customerName: "Utilisateur a",
      customerEmail: email("a"),
    })
    expect(orders[0].customerName).toBe("Utilisateur b")
    expect(orders[0].itemCount).toBe(1)
  })

  it("returns a single order with item snapshots, delivery info and customer", async () => {
    const orderId = await createOrder(userIdA, [
      { variantId: variantP1, quantity: 1 },
      { variantId: variantP2, quantity: 2 },
    ])

    const order = await getAdminOrder(orderId)

    expect(order).toMatchObject({
      id: orderId,
      status: "pending",
      cityName,
      address: ADDRESS,
      phone: PHONE,
      total: 170000,
      shippingFee: 3500,
      customerName: "Utilisateur a",
      customerEmail: email("a"),
    })
    expect(order.items).toHaveLength(2)
    expect(order.items[1]).toMatchObject({
      productName: "Admin Ordres Produit A",
      variantName: "Premium",
      price: 60000,
      quantity: 2,
    })
  })

  it("rejects an unknown order", async () => {
    await expect(getAdminOrder("commande-inconnue")).rejects.toThrow(OrderNotFoundError)
  })
})

describe("admin lifecycle", () => {
  it("walks an order to delivered and reflects it in the admin reads", async () => {
    await ajouterArticleAuPanier({ role: "client", compteId: userIdA }, variantP1, 2)
    const order = await placeOrder(userIdA, { cityId, address: ADDRESS, phone: PHONE }, makeEffects())

    await updateOrderStatus(order.id, "confirmed", makeEffects())
    await updateOrderStatus(order.id, "shipped", makeEffects())
    await updateOrderStatus(order.id, "delivered", makeEffects())

    const fetched = await getAdminOrder(order.id)
    expect(fetched.status).toBe("delivered")
    const listed = await listAdminOrders()
    expect(listed.find((item) => item.id === order.id)?.status).toBe("delivered")
  })

  it("cancels a pending order, restocks the variants and reflects it in admin reads", async () => {
    await ajouterArticleAuPanier({ role: "client", compteId: userIdA }, variantP1, 2)
    const order = await placeOrder(userIdA, { cityId, address: ADDRESS, phone: PHONE }, makeEffects())
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantP1 } })).stock
    ).toBe(3)

    await updateOrderStatus(order.id, "cancelled", makeEffects())

    expect((await getAdminOrder(order.id)).status).toBe("cancelled")
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantP1 } })).stock
    ).toBe(5)
  })
})
