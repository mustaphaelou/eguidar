import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
import { totalPayable } from "@/lib/money"
import { ajouterArticleAuPanier } from "@/lib/panier"
import { sessionUserMock } from "@/test/navigation-mocks"
import { getAdminOrder, listAdminOrders } from "@/lib/use-cases/admin-orders"
import {
  OrderNotFoundError,
  placeOrder,
  updateOrderStatus,
  type OrderEffects,
} from "@/lib/use-cases/orders"

vi.mock("@/lib/use-cases/session-courante", async () => {
  const h = await import("@/test/navigation-mocks")
  return { lireSession: h.sessionUserMock }
})
import type { OrderStatus } from "@/lib/generated/prisma/client"

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

function commeClient(userId: string) {
  sessionUserMock.mockResolvedValue({ id: userId })
}

beforeAll(async () => {
  userIdA = await createUser("a")
  userIdB = await createUser("b")

  const category = await prisma.category.create({
    data: {
      name: `Catégorie admin ${runId}`,
      slug: `admin-orders-cat-${runId}`,
    },
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
          {
            name: "Standard",
            sku: `ADMIN-${runId}-A1`,
            priceDelta: 0,
            stock: 5,
          },
          {
            name: "Premium",
            sku: `ADMIN-${runId}-A2`,
            priceDelta: 10000,
            stock: 3,
          },
        ],
      },
    },
    include: { variants: true },
  })
  variantP1 = product.variants.find((v) => v.name === "Standard")!.id
  variantP2 = product.variants.find((v) => v.name === "Premium")!.id

  const city = await prisma.deliveryCity.create({
    data: { name: cityName, slug: `ville-admin-${runId}`, fee: 3500 },
  })
  cityId = city.id
})

beforeEach(async () => {
  sessionUserMock.mockReset()
  await prisma.orderItem.deleteMany({
    where: {
      order: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
    },
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
    where: {
      order: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
    },
  })
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
  })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `admin-orders-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `admin-orders-${runId}-` } },
  })
  await prisma.product.deleteMany({
    where: { slug: { endsWith: `-${runId}` } },
  })
  await prisma.category.deleteMany({
    where: { slug: `admin-orders-cat-${runId}` },
  })
  await prisma.deliveryCity.deleteMany({ where: { name: cityName } })
  await prisma.$disconnect()
})

async function createOrder(
  userId: string,
  items: { variantId: string; quantity: number }[],
  opts?: { createdAt?: Date; shippingFee?: number }
): Promise<string> {
  const total = items.reduce(
    (sum, item) =>
      sum +
      50000 * item.quantity +
      (item.variantId === variantP2 ? 10000 * item.quantity : 0),
    0
  )
  const shippingFee = opts?.shippingFee ?? 3500
  const order = await prisma.order.create({
    data: {
      userId,
      cityName,
      address: ADDRESS,
      phone: PHONE,
      total,
      shippingFee,
      totalPayable: totalPayable({ total, shippingFee }),
      ...(opts?.createdAt ? { createdAt: opts.createdAt } : {}),
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

async function setOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { status } })
}

describe("admin order reads", () => {
  it("lists all orders with status, customer, totals and date, newest first", async () => {
    const firstId = await createOrder(userIdA, [
      { variantId: variantP1, quantity: 2 },
    ])
    const secondId = await createOrder(userIdB, [
      { variantId: variantP1, quantity: 1 },
    ])

    const orders = await listAdminOrders()

    expect(orders.map((order) => order.id)).toEqual([secondId, firstId])
    expect(orders[1]).toMatchObject({
      status: "pending",
      total: 100000,
      shippingFee: 3500,
      totalPayable: 103500,
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
      totalPayable: 173500,
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
    await expect(getAdminOrder("commande-inconnue")).rejects.toThrow(
      OrderNotFoundError
    )
  })
})

describe("admin lifecycle", () => {
  it("walks an order to delivered and reflects it in the admin reads", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, {
      cityId,
      address: ADDRESS,
      phone: PHONE,
    })

    await updateOrderStatus(order.id, "confirmed")
    await updateOrderStatus(order.id, "shipped")
    await updateOrderStatus(order.id, "delivered")

    const fetched = await getAdminOrder(order.id)
    expect(fetched.status).toBe("delivered")
    const listed = await listAdminOrders()
    expect(listed.find((item) => item.id === order.id)?.status).toBe(
      "delivered"
    )
  })

  it("emails the customer on each status change", async () => {
    const sendOrderStatusEmail = vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    )
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, {
      cityId,
      address: ADDRESS,
      phone: PHONE,
    })

    await updateOrderStatus(order.id, "confirmed", { sendOrderStatusEmail })
    await updateOrderStatus(order.id, "shipped", { sendOrderStatusEmail })
    await updateOrderStatus(order.id, "delivered", { sendOrderStatusEmail })

    expect(sendOrderStatusEmail).toHaveBeenCalledTimes(3)
    expect(sendOrderStatusEmail.mock.calls.map((call) => call[1])).toEqual([
      "confirmed",
      "shipped",
      "delivered",
    ])
    expect(sendOrderStatusEmail.mock.calls[0][0]).toMatchObject({
      userEmail: email("a"),
      orderId: order.id,
    })
  })

  it("invalidates the order cache post-commit", async () => {
    const invalidateCommande = vi.fn<(orderId: string) => void>()
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, {
      cityId,
      address: ADDRESS,
      phone: PHONE,
    })

    await updateOrderStatus(order.id, "confirmed", { invalidateCommande })

    expect(invalidateCommande).toHaveBeenCalledOnce()
    expect(invalidateCommande).toHaveBeenCalledWith(order.id)
  })

  it("cancels a pending order, restocks the variants and reflects it in admin reads", async () => {
    commeClient(userIdA)
    await ajouterArticleAuPanier(variantP1, 2)
    const order = await placeOrder(userIdA, {
      cityId,
      address: ADDRESS,
      phone: PHONE,
    })
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP1 },
        })
      ).stock
    ).toBe(3)

    await updateOrderStatus(order.id, "cancelled")

    expect((await getAdminOrder(order.id)).status).toBe("cancelled")
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP1 },
        })
      ).stock
    ).toBe(5)
  })
})

describe("admin orders listing filters", () => {
  const six: OrderStatus[] = [
    "pending",
    "confirmed",
    "shipped",
    "delivered",
    "cancelled",
    "returned",
  ]

  it("filters by each of the six statuses alone", async () => {
    const idsByStatus = {} as Record<OrderStatus, string>
    for (const status of six) {
      const orderId = await createOrder(userIdA, [
        { variantId: variantP1, quantity: 1 },
      ])
      await setOrderStatus(orderId, status)
      idsByStatus[status] = orderId
    }

    for (const status of six) {
      const result = await listAdminOrders({ statuses: [status] })
      expect(result.orders.map((order) => order.id)).toEqual([
        idsByStatus[status],
      ])
      expect(result.orders[0].status).toBe(status)
      expect(result.totalCount).toBe(1)
      expect(result.pageCount).toBe(1)
    }
  })

  it("filters by a combination of statuses and excludes the rest", async () => {
    const pendingId = await createOrder(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    const deliveredId = await createOrder(userIdA, [
      { variantId: variantP1, quantity: 2 },
    ])
    const confirmedId = await createOrder(userIdB, [
      { variantId: variantP1, quantity: 1 },
    ])
    await setOrderStatus(deliveredId, "delivered")
    await setOrderStatus(confirmedId, "confirmed")

    const result = await listAdminOrders({ statuses: ["confirmed", "pending"] })

    expect(result.orders.map((order) => order.id)).toEqual([
      confirmedId,
      pendingId,
    ])
    expect(result.totalCount).toBe(2)
  })

  it("searches case-insensitively by customer name and by email", async () => {
    const orderA = await createOrder(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    const orderB = await createOrder(userIdB, [
      { variantId: variantP1, quantity: 1 },
    ])

    const byName = await listAdminOrders({ q: "TEUR A" })
    expect(byName.orders.map((order) => order.id)).toEqual([orderA])
    expect(byName.totalCount).toBe(1)

    const byEmail = await listAdminOrders({ q: `-B@TEST.MA` })
    expect(byEmail.orders.map((order) => order.id)).toEqual([orderB])
    expect(byEmail.totalCount).toBe(1)

    const byRunId = await listAdminOrders({ q: runId.toUpperCase() })
    expect([...byRunId.orders.map((order) => order.id)].sort()).toEqual(
      [orderA, orderB].sort()
    )

    const noMatch = await listAdminOrders({ q: "zebre-inconnu" })
    expect(noMatch.orders).toEqual([])
    expect(noMatch.totalCount).toBe(0)
    expect(noMatch.pageCount).toBe(0)
  })
})

describe("admin orders listing sort", () => {
  it("sorts by date ascending and descending, defaulting to newest first", async () => {
    const olderId = await createOrder(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      {
        createdAt: new Date("2026-03-01T10:00:00Z"),
      }
    )
    const middleId = await createOrder(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      {
        createdAt: new Date("2026-03-02T10:00:00Z"),
      }
    )
    const newerId = await createOrder(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      {
        createdAt: new Date("2026-03-03T10:00:00Z"),
      }
    )

    const defaultSort = await listAdminOrders()
    expect(defaultSort.map((order) => order.id)).toEqual([
      newerId,
      middleId,
      olderId,
    ])

    const desc = await listAdminOrders({ tri: "date", sens: "desc" })
    expect(desc.orders.map((order) => order.id)).toEqual([
      newerId,
      middleId,
      olderId,
    ])

    const asc = await listAdminOrders({ tri: "date", sens: "asc" })
    expect(asc.orders.map((order) => order.id)).toEqual([
      olderId,
      middleId,
      newerId,
    ])
  })

  it("sorts by Total à payer ascending and descending", async () => {
    const smallId = await createOrder(userIdA, [
      { variantId: variantP1, quantity: 1 },
    ])
    const mediumId = await createOrder(userIdA, [
      { variantId: variantP1, quantity: 2 },
    ])
    const largeId = await createOrder(
      userIdA,
      [{ variantId: variantP2, quantity: 2 }],
      {
        createdAt: new Date("2026-03-01T10:00:00Z"),
      }
    )
    expect(largeId).toBeTruthy()

    const asc = await listAdminOrders({ tri: "total", sens: "asc" })
    expect(asc.orders.map((order) => order.id)).toEqual([
      smallId,
      mediumId,
      largeId,
    ])

    const desc = await listAdminOrders({ tri: "total", sens: "desc" })
    expect(desc.orders.map((order) => order.id)).toEqual([
      largeId,
      mediumId,
      smallId,
    ])
  })

  it("orders by Total à payer when Sous-totaux tie and Frais de livraison differ", async () => {
    const cheapDeliveryId = await createOrder(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      { shippingFee: 3500 }
    )
    const priceyDeliveryId = await createOrder(
      userIdA,
      [{ variantId: variantP1, quantity: 1 }],
      { shippingFee: 5000 }
    )

    const cheap = await getAdminOrder(cheapDeliveryId)
    const pricey = await getAdminOrder(priceyDeliveryId)
    expect(cheap.total).toBe(pricey.total)
    expect(cheap.totalPayable).toBe(cheap.total + 3500)
    expect(pricey.totalPayable).toBe(pricey.total + 5000)

    const asc = await listAdminOrders({ tri: "total", sens: "asc" })
    expect(asc.orders.map((order) => order.id)).toEqual([
      cheapDeliveryId,
      priceyDeliveryId,
    ])

    const desc = await listAdminOrders({ tri: "total", sens: "desc" })
    expect(desc.orders.map((order) => order.id)).toEqual([
      priceyDeliveryId,
      cheapDeliveryId,
    ])
  })
})

describe("admin orders listing pagination", () => {
  it("switches page size, keeps counts stable while pages slide and floors out-of-range pages", async () => {
    const createdAsc: string[] = []
    for (let index = 0; index < 25; index += 1) {
      const orderId = await createOrder(
        userIdA,
        [{ variantId: variantP1, quantity: 1 }],
        {
          createdAt: new Date(Date.UTC(2026, 0, 1, 9, index)),
        }
      )
      createdAsc.push(orderId)
    }
    const expectedDesc = [...createdAsc].reverse()

    for (const pageSize of [10, 20, 50] as const) {
      const pageCount = Math.ceil(25 / pageSize)
      let collected: string[] = []
      for (let page = 1; page <= pageCount; page += 1) {
        const result = await listAdminOrders({ page, pageSize })
        expect(result.pageCount).toBe(pageCount)
        expect(result.totalCount).toBe(25)
        collected = [...collected, ...result.orders.map((order) => order.id)]
      }
      expect(collected).toEqual(expectedDesc)
    }

    const beyondRange = await listAdminOrders({ page: 99, pageSize: 10 })
    expect(beyondRange.orders).toEqual([])
    expect(beyondRange.totalCount).toBe(25)
    expect(beyondRange.pageCount).toBe(3)
  })
})
