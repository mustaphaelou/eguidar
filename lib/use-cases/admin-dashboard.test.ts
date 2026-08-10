import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { getDashboardStats, LOW_STOCK_THRESHOLD } from "@/lib/use-cases/admin-dashboard"

const runId = randomUUID().slice(0, 8)

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
            { name: "Faible", sku: `DB-${runId}-LOW`, priceDelta: 0, stock: LOW_STOCK_THRESHOLD - 1 },
            { name: "Rupture", sku: `DB-${runId}-OUT`, priceDelta: 0, stock: 0 },
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
        variants: { create: [{ name: "OK", sku: `DB-${runId}-OK`, priceDelta: 0, stock: 100 }] },
      },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { slug: { startsWith: `dashboard-` } } })
    await prisma.category.deleteMany({ where: { slug: `dashboard-cat-${runId}` } })
    await prisma.$disconnect()
  })

  it("counts products and categories", async () => {
    const stats = await getDashboardStats()
    expect(stats.productCount).toBeGreaterThanOrEqual(2)
    expect(stats.categoryCount).toBeGreaterThanOrEqual(1)
    expect(stats.lowStockVariants.length).toBeGreaterThanOrEqual(2)
  })

  it("lists variants at or below the low-stock threshold with product info", async () => {
    const stats = await getDashboardStats()
    const low = stats.lowStockVariants.filter((v) => v.productSlug === `dashboard-low-${runId}`)
    expect(low).toHaveLength(2)
    expect(low[0]).toMatchObject({
      productName: "Produit stock faible",
      stock: 0,
      sku: `DB-${runId}-OUT`,
    })
    expect(stats.lowStockVariants.some((v) => v.stock > LOW_STOCK_THRESHOLD)).toBe(false)
  })

  it("includes the most recently created products", async () => {
    const stats = await getDashboardStats()
    expect(stats.recentProducts.length).toBeGreaterThanOrEqual(2)
    expect(stats.recentProducts.some((p) => p.slug === `dashboard-low-${runId}`)).toBe(true)
  })
})
