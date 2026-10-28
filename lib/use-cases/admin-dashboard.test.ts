import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  getDashboardStats,
  localMonthKey,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"

const runId = randomUUID().slice(0, 8)
const DAY_MS = 86_400_000

type SeedStatus =
  "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned"

let userIdA: string

async function createUser(suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `dashboard-${runId}-${suffix}@test.ma`,
      name: `Utilisateur dashboard ${suffix}`,
    },
  })
  return user.id
}

async function createSeedOrder(
  status: SeedStatus,
  ageDays: number,
  total: number,
  shippingFee: number
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId: userIdA,
      cityName: "Casablanca",
      address: "1 Rue du Test",
      phone: "+212600000000",
      total,
      shippingFee,
      totalPayable: total + shippingFee,
      status,
      createdAt: new Date(Date.now() - ageDays * DAY_MS),
    },
  })
  return order.id
}

async function createSeedOrderAt(
  status: SeedStatus,
  createdAt: Date,
  total: number,
  shippingFee: number,
  totalPayableStocké: number
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId: userIdA,
      cityName: "Casablanca",
      address: "1 Rue du Test",
      phone: "+212600000000",
      total,
      shippingFee,
      totalPayable: totalPayableStocké,
      status,
      createdAt,
    },
  })
  return order.id
}

describe("admin dashboard stats", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: "Catégorie Dashboard", slug: `dashboard-cat-${runId}` },
    })
    await prisma.product.create({
      data: {
        name: "Produit stock faible",
        slug: `dashboard-low-${runId}`,
        description: "",
        brand: "Test",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
        variants: {
          create: [
            {
              name: "Faible",
              sku: `DB-${runId}-LOW`,
              priceDelta: 0,
              stock: LOW_STOCK_THRESHOLD - 1,
            },
            {
              name: "Rupture",
              sku: `DB-${runId}-OUT`,
              priceDelta: 0,
              stock: 0,
            },
          ],
        },
      },
    })
    await prisma.product.create({
      data: {
        name: "Produit stock suffisant",
        slug: `dashboard-ok-${runId}`,
        description: "",
        brand: "Test",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
        variants: {
          create: [
            { name: "OK", sku: `DB-${runId}-OK`, priceDelta: 0, stock: 100 },
          ],
        },
      },
    })
    userIdA = await createUser("a")
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({
      where: {
        order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
      },
    })
    await prisma.order.deleteMany({
      where: { user: { email: { startsWith: `dashboard-${runId}-` } } },
    })
  })

  afterAll(async () => {
    await prisma.orderItem.deleteMany({
      where: {
        order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
      },
    })
    await prisma.order.deleteMany({
      where: { user: { email: { startsWith: `dashboard-${runId}-` } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: `dashboard-${runId}-` } },
    })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `dashboard-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: `dashboard-cat-${runId}` },
    })
    await prisma.$disconnect()
  })

  it("counts products and categories", async () => {
    const stats = await getDashboardStats()
    expect(stats.productCount).toBeGreaterThanOrEqual(2)
    expect(stats.categoryCount).toBeGreaterThanOrEqual(1)
    expect(stats.lowStockVariants.length).toBeGreaterThanOrEqual(2)
  })

  it("compte les Produits en rupture, y compris ceux qui n'ont aucune Variante", async () => {
    const avant = (await getDashboardStats()).outOfStockCount
    const sansVariante = await prisma.product.create({
      data: {
        name: "Produit sans variante",
        slug: `dashboard-sans-variante-${runId}`,
        description: "",
        brand: "Test",
        price: 1000,
        specs: {},
        images: [],
      },
    })

    try {
      expect((await getDashboardStats()).outOfStockCount).toBe(avant + 1)
    } finally {
      await prisma.product.delete({ where: { id: sansVariante.id } })
    }

    expect((await getDashboardStats()).outOfStockCount).toBe(avant)
  })

  it("lists variants at or below the low-stock threshold with product info", async () => {
    const stats = await getDashboardStats()
    const low = stats.lowStockVariants.filter(
      (v) => v.productSlug === `dashboard-low-${runId}`
    )
    expect(low).toHaveLength(2)
    expect(low[0]).toMatchObject({
      productName: "Produit stock faible",
      stock: 0,
      sku: `DB-${runId}-OUT`,
    })
    expect(
      stats.lowStockVariants.some((v) => v.stock > LOW_STOCK_THRESHOLD)
    ).toBe(false)
  })

  it("includes the most recently created products", async () => {
    const stats = await getDashboardStats()
    expect(stats.recentProducts.length).toBeGreaterThanOrEqual(2)
    expect(
      stats.recentProducts.some((p) => p.slug === `dashboard-low-${runId}`)
    ).toBe(true)
  })

  describe("aggregates (#84)", () => {
    it("sums delivered-only money inside exact 30-day window boundaries for caEncaisse30j", async () => {
      await createSeedOrder("delivered", 29, 15000, 500)
      await createSeedOrder("delivered", 31, 40000, 2000)
      await createSeedOrder("shipped", 5, 99999, 999)
      await createSeedOrder("pending", 7, 12345, 111)
      await createSeedOrder("cancelled", 3, 55555, 222)

      const stats = await getDashboardStats()

      expect(stats.caEncaisse30j).toBe(15500)
    })

    it("computes caDelta against the previous window rounded to one decimal", async () => {
      await createSeedOrder("delivered", 45, 9000, 700)
      await createSeedOrder("delivered", 35, 12000, 800)
      await createSeedOrder("delivered", 10, 400, 150)

      const stats = await getDashboardStats()

      expect(stats.caDelta).toBe(-97.6)
      expect(stats.caEncaisse30j).toBe(550)
    })

    it("returns an undefined caDelta when the prior window sums to zero", async () => {
      await createSeedOrder("delivered", 10, 550, 50)

      const stats = await getDashboardStats()

      expect(stats.caDelta).toBeUndefined()
      expect(stats.caEncaisse30j).toBe(600)
    })

    it("yields a negative caDelta when the current window is empty while the prior is not", async () => {
      await createSeedOrder("pending", 10, 4242, 58)
      await createSeedOrder("delivered", 40, 1200, 300)

      const stats = await getDashboardStats()

      expect(stats.caDelta).toBe(-100)
      expect(stats.caEncaisse30j).toBe(0)
    })

    it("counts ordersLast30 across every status created inside the window only", async () => {
      await createSeedOrder("delivered", 29, 100, 20)
      await createSeedOrder("pending", 25, 200, 30)
      await createSeedOrder("cancelled", 20, 300, 40)
      await createSeedOrder("confirmed", 12, 400, 50)
      await createSeedOrder("shipped", 31, 700, 70)
      await createSeedOrder("returned", 35, 800, 80)

      const stats = await getDashboardStats()

      expect(stats.ordersLast30).toBe(4)
    })

    it("exposes totalPayable on recent orders while keeping existing fields intact", async () => {
      const newerId = await createSeedOrder("delivered", 2, 2550, 450)
      const olderId = await createSeedOrder("cancelled", 4, 6600, 340)

      const stats = await getDashboardStats()

      expect(stats.recentOrders.map((order) => order.id)).toEqual([
        newerId,
        olderId,
      ])
      expect(stats.recentOrders[0]).toMatchObject({
        status: "delivered",
        total: 2550,
        totalPayable: 3000,
        itemCount: 0,
      })
      expect(stats.recentOrders[1]).toMatchObject({
        status: "cancelled",
        total: 6600,
        totalPayable: 6940,
        itemCount: 0,
      })
      expect(stats.recentOrders[0].createdAt.getTime()).toBeGreaterThan(
        stats.recentOrders[1].createdAt.getTime()
      )
    })

    it("buckets delivered-only revenue into twelve zero-filled calendar months oldest to newest", async () => {
      const nowDate = new Date()
      const currentMonthStart = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        1
      )
      const expectedKeyFor = (monthOffset: number) =>
        localMonthKey(
          new Date(
            currentMonthStart.getFullYear(),
            currentMonthStart.getMonth() - monthOffset,
            1
          )
        )
      const localMidMonth = (monthOffset: number, day: number) =>
        new Date(
          currentMonthStart.getFullYear(),
          currentMonthStart.getMonth() - monthOffset,
          day,
          12
        )

      await createSeedOrderAt(
        "delivered",
        localMidMonth(7, 15),
        12000,
        800,
        12800
      )
      await createSeedOrderAt(
        "delivered",
        localMidMonth(3, 15),
        5000,
        250,
        5250
      )
      await createSeedOrderAt(
        "delivered",
        new Date(
          Math.min(currentMonthStart.getTime() + 5 * 60_000, Date.now() - 1_000)
        ),
        9999,
        1,
        10000
      )
      await createSeedOrderAt("shipped", localMidMonth(6, 15), 7000, 300, 7300)
      await createSeedOrderAt("cancelled", localMidMonth(6, 16), 4444, 44, 4488)
      await createSeedOrderAt("returned", localMidMonth(2, 15), 3600, 400, 4000)
      await createSeedOrderAt(
        "delivered",
        localMidMonth(13, 15),
        8888,
        888,
        9776
      )

      const stats = await getDashboardStats()

      const revenueByKey = new Map<string, number>()
      revenueByKey.set(expectedKeyFor(7), 12800)
      revenueByKey.set(expectedKeyFor(3), 5250)
      revenueByKey.set(expectedKeyFor(0), 10000)

      const expected: Array<{ month: string; revenue: number }> = []
      for (let offset = 11; offset >= 0; offset--) {
        const month = expectedKeyFor(offset)
        expected.push({ month, revenue: revenueByKey.get(month) ?? 0 })
      }

      expect(stats.revenueByMonth).toHaveLength(12)
      expect(stats.revenueByMonth).toEqual(expected)
      expect(
        stats.revenueByMonth.find(
          (bucket) => bucket.month === expectedKeyFor(5)
        )?.revenue
      ).toBe(0)
      expect(
        stats.revenueByMonth.some(
          (bucket) => bucket.month === expectedKeyFor(13)
        )
      ).toBe(false)
    })

    it("answers with the persisted Total à payer, never with a sum recomputed from the Sous-total and the Frais de livraison", async () => {
      const totalÀPayerStocké = 38000
      const createdAt = new Date(Date.now() - 3 * DAY_MS)
      const id = await createSeedOrderAt(
        "delivered",
        createdAt,
        45000,
        5000,
        totalÀPayerStocké
      )

      const stats = await getDashboardStats()

      expect(stats.caEncaisse30j).toBe(totalÀPayerStocké)
      expect(
        stats.revenueByMonth.find(
          (bucket) => bucket.month === localMonthKey(createdAt)
        )?.revenue
      ).toBe(totalÀPayerStocké)
      const recente = stats.recentOrders.find((order) => order.id === id)
      expect(recente).toMatchObject({
        total: 45000,
        totalPayable: totalÀPayerStocké,
      })
    })
  })
})
