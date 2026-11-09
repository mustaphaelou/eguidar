import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { cleDuSeau, seauxDePeriode } from "@/lib/tableau-de-bord-periode"
import {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"

const runId = randomUUID().slice(0, 8)
const DAY_MS = 86_400_000

type SeedStatus =
  "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned"

let userIdA: string
let produitStockFaibleId: string

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
    const produitStockFaible = await prisma.product.create({
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
    produitStockFaibleId = produitStockFaible.id
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

  it("ne publie plus les champs morts du contrat", async () => {
    const stats = await getDashboardStats()

    expect(stats.productCount).toBeGreaterThanOrEqual(2)
    expect(stats.lowStockVariants.length).toBeGreaterThanOrEqual(2)
    expect("categoryCount" in stats).toBe(false)
    expect("recentProducts" in stats).toBe(false)
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
      (v) => v.productId === produitStockFaibleId
    )
    expect(low).toHaveLength(2)
    expect(low[0]).toMatchObject({
      productName: "Produit stock faible",
      stock: 0,
      sku: `DB-${runId}-OUT`,
    })
    expect("productSlug" in low[0]!).toBe(false)
    expect(
      stats.lowStockVariants.some((v) => v.stock > LOW_STOCK_THRESHOLD)
    ).toBe(false)
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

    it("range le Chiffre d'affaires encaissé en trente jours calendaires, du plus ancien au plus récent", async () => {
      const maintenant = new Date()
      const jourLocal = (joursAvant: number, heure = 12) =>
        new Date(
          maintenant.getFullYear(),
          maintenant.getMonth(),
          maintenant.getDate() - joursAvant,
          heure
        )

      const aujourdHui = new Date(maintenant)
      const hier = jourLocal(1)
      const premierJour = jourLocal(29)
      const horsFenetre = jourLocal(30)

      await createSeedOrderAt("delivered", aujourdHui, 900, 100, 1000)
      await createSeedOrderAt("delivered", hier, 1800, 200, 2000)
      await createSeedOrderAt("delivered", premierJour, 2700, 300, 3000)
      await createSeedOrderAt("delivered", horsFenetre, 3600, 400, 4000)
      await createSeedOrderAt("shipped", jourLocal(2), 5000, 500, 5500)

      const stats = await getDashboardStats("30j")

      expect(stats.chiffreAffairesEncaisse).toHaveLength(30)
      expect(stats.chiffreAffairesEncaisse).toEqual(
        seauxDePeriode("30j", maintenant).map((seau) => ({
          cle: seau.cle,
          montant:
            seau.cle === cleDuSeau("30j", aujourdHui)
              ? 1000
              : seau.cle === cleDuSeau("30j", hier)
                ? 2000
                : seau.cle === cleDuSeau("30j", premierJour)
                  ? 3000
                  : 0,
        }))
      )
      expect(stats.caEncaisse30j).toBe(6000)
    })

    it("range le Chiffre d'affaires encaissé en treize semaines, du plus ancien au plus récent", async () => {
      const maintenant = new Date()
      const seaux = seauxDePeriode("90j", maintenant)
      const premierJour = new Date(seaux[0]!.debut.getTime() + 12 * 3_600_000)
      const semainePrecedente = new Date(maintenant.getTime() - 7 * DAY_MS)
      const horsFenetre = new Date(seaux[0]!.debut.getTime() - 60_000)

      await createSeedOrderAt("delivered", premierJour, 700, 100, 800)
      await createSeedOrderAt("delivered", semainePrecedente, 1400, 200, 1600)
      await createSeedOrderAt("delivered", maintenant, 2100, 300, 2400)
      await createSeedOrderAt("delivered", horsFenetre, 3500, 500, 4000)
      await createSeedOrderAt(
        "cancelled",
        new Date(maintenant.getTime() - 2 * DAY_MS),
        9999,
        999,
        10998
      )

      const stats = await getDashboardStats("90j")

      expect(stats.chiffreAffairesEncaisse).toHaveLength(13)
      expect(stats.chiffreAffairesEncaisse).toEqual(
        seaux.map((seau) => ({
          cle: seau.cle,
          montant:
            seau.cle === cleDuSeau("90j", premierJour)
              ? 800
              : seau.cle === cleDuSeau("90j", semainePrecedente)
                ? 1600
                : seau.cle === cleDuSeau("90j", maintenant)
                  ? 2400
                  : 0,
        }))
      )
    })

    it("range le Chiffre d'affaires encaissé en douze mois calendaires, du plus ancien au plus récent", async () => {
      const nowDate = new Date()
      const currentMonthStart = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        1
      )
      const localMonth = (monthOffset: number, day: number) =>
        new Date(
          currentMonthStart.getFullYear(),
          currentMonthStart.getMonth() - monthOffset,
          day,
          12
        )
      const expectedKeyFor = (monthOffset: number) =>
        cleDuSeau("12mois", localMonth(monthOffset, 15))

      await createSeedOrderAt("delivered", localMonth(7, 15), 12000, 800, 12800)
      await createSeedOrderAt("delivered", localMonth(3, 15), 5000, 250, 5250)
      await createSeedOrderAt(
        "delivered",
        new Date(
          Math.min(currentMonthStart.getTime() + 5 * 60_000, Date.now() - 1_000)
        ),
        9999,
        1,
        10000
      )
      await createSeedOrderAt("shipped", localMonth(6, 15), 7000, 300, 7300)
      await createSeedOrderAt("cancelled", localMonth(6, 16), 4444, 44, 4488)
      await createSeedOrderAt("returned", localMonth(2, 15), 3600, 400, 4000)
      await createSeedOrderAt("delivered", localMonth(13, 15), 8888, 888, 9776)

      const stats = await getDashboardStats("12mois")

      const montantParCle = new Map<string, number>()
      montantParCle.set(expectedKeyFor(7), 12800)
      montantParCle.set(expectedKeyFor(3), 5250)
      montantParCle.set(expectedKeyFor(0), 10000)

      const expected: Array<{ cle: string; montant: number }> = []
      for (let offset = 11; offset >= 0; offset--) {
        const cle = expectedKeyFor(offset)
        expected.push({ cle, montant: montantParCle.get(cle) ?? 0 })
      }

      expect(stats.chiffreAffairesEncaisse).toHaveLength(12)
      expect(stats.chiffreAffairesEncaisse).toEqual(expected)
      expect(
        stats.chiffreAffairesEncaisse.find(
          (seau) => seau.cle === expectedKeyFor(5)
        )?.montant
      ).toBe(0)
      expect(
        stats.chiffreAffairesEncaisse.some(
          (seau) => seau.cle === expectedKeyFor(13)
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

      const stats = await getDashboardStats("12mois")

      expect(stats.caEncaisse30j).toBe(totalÀPayerStocké)
      expect(
        stats.chiffreAffairesEncaisse.find(
          (seau) => seau.cle === cleDuSeau("12mois", createdAt)
        )?.montant
      ).toBe(totalÀPayerStocké)
      const recente = stats.recentOrders.find((order) => order.id === id)
      expect(recente).toMatchObject({
        total: 45000,
        totalPayable: totalÀPayerStocké,
      })
    })
  })
})
