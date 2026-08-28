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
import { ajouterArticleAuPanier } from "@/lib/panier"
import {
  getAdminOrder,
  listAdminOrders,
  parseAdminOrdersSearchParams,
} from "@/lib/use-cases/admin-orders"
import {
  OrderNotFoundError,
  placeOrder,
  updateOrderStatus,
} from "@/lib/use-cases/orders"
import type { OrderStatus } from "@/lib/generated/prisma/client"
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
    sendOrderPlacedEmail: vi.fn<OrderEffects["sendOrderPlacedEmail"]>(
      async () => {}
    ),
    sendOrderStatusEmail: vi.fn<OrderEffects["sendOrderStatusEmail"]>(
      async () => {}
    ),
  }
}

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
    data: { name: cityName, fee: 3500 },
  })
  cityId = city.id
})

beforeEach(async () => {
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
  opts?: { createdAt?: Date }
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId,
      cityName,
      address: ADDRESS,
      phone: PHONE,
      total: items.reduce(
        (sum, item) =>
          sum +
          50000 * item.quantity +
          (item.variantId === variantP2 ? 10000 * item.quantity : 0),
        0
      ),
      shippingFee: 3500,
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
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP1,
      2
    )
    const order = await placeOrder(
      userIdA,
      { cityId, address: ADDRESS, phone: PHONE },
      makeEffects()
    )

    await updateOrderStatus(order.id, "confirmed", makeEffects())
    await updateOrderStatus(order.id, "shipped", makeEffects())
    await updateOrderStatus(order.id, "delivered", makeEffects())

    const fetched = await getAdminOrder(order.id)
    expect(fetched.status).toBe("delivered")
    const listed = await listAdminOrders()
    expect(listed.find((item) => item.id === order.id)?.status).toBe(
      "delivered"
    )
  })

  it("cancels a pending order, restocks the variants and reflects it in admin reads", async () => {
    await ajouterArticleAuPanier(
      { role: "client", compteId: userIdA },
      variantP1,
      2
    )
    const order = await placeOrder(
      userIdA,
      { cityId, address: ADDRESS, phone: PHONE },
      makeEffects()
    )
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantP1 },
        })
      ).stock
    ).toBe(3)

    await updateOrderStatus(order.id, "cancelled", makeEffects())

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

  it("sorts by total ascending and descending via the Total à payer proxy field", async () => {
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

describe("parseAdminOrdersSearchParams", () => {
  it("maps a fully valid query", () => {
    expect(
      parseAdminOrdersSearchParams({
        statut: "pending,confirmed",
        q: " alix ",
        page: "3",
        pageSize: "20",
        tri: "total",
        sens: "asc",
      })
    ).toEqual({
      statuses: ["pending", "confirmed"],
      q: "alix",
      tri: "total",
      sens: "asc",
      page: 3,
      pageSize: 20,
    })
  })

  it("falls back per rule on invalid scalar values", () => {
    for (const badPage of ["-4", "0", "abc", "2.5", ""]) {
      expect(parseAdminOrdersSearchParams({ page: badPage }).page).toBe(1)
    }
    expect(parseAdminOrdersSearchParams({ pageSize: "35" }).pageSize).toBe(10)
    expect(parseAdminOrdersSearchParams({ pageSize: "abc" }).pageSize).toBe(10)
    expect(parseAdminOrdersSearchParams({ pageSize: "20" }).pageSize).toBe(20)
    expect(parseAdminOrdersSearchParams({ tri: "weight" }).tri).toBe("date")
    expect(parseAdminOrdersSearchParams({ sens: "upward" }).sens).toBe("desc")
  })

  it("returns pure defaults on empty input", () => {
    expect(parseAdminOrdersSearchParams({})).toEqual({
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 10,
    })
  })

  it("keeps valid statut entries, drops unknown ones and deduplicates", () => {
    expect(
      parseAdminOrdersSearchParams({ statut: "bogus,pending , returned,bogus" })
        .statuses
    ).toEqual(["pending", "returned"])
    expect(
      parseAdminOrdersSearchParams({ statut: "bogus,weird" }).statuses
    ).toBeUndefined()
    expect(
      parseAdminOrdersSearchParams({ statut: "cancelled,cancelled" }).statuses
    ).toEqual(["cancelled"])
    expect(
      parseAdminOrdersSearchParams({ statut: "" }).statuses
    ).toBeUndefined()
  })

  it("tolerates duplicated params, keeping the first occurrence", () => {
    expect(parseAdminOrdersSearchParams({ page: ["7", "9"] }).page).toBe(7)
    expect(
      parseAdminOrdersSearchParams({ statut: ["pending", "delivered"] })
        .statuses
    ).toEqual(["pending"])
  })

  it("treats whitespace-only q as absent", () => {
    expect(parseAdminOrdersSearchParams({ q: "   " }).q).toBeUndefined()
  })
})
