import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  serializePanierVisiteur,
} from "@/lib/panier-visiteur"
import { resetCookieStoreMock, setCookie } from "@/test/cookie-store"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

import { getPanierVisiteur } from "./get-panier-visiteur"

const runId = randomUUID().slice(0, 8)

let variantStandard: string
let variantPremium: string
let variantUnique: string

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `gpv-cat-${runId}` },
  })
  const productA = await prisma.product.create({
    data: {
      name: "Produit GPV A",
      slug: `gpv-prod-a-${runId}`,
      description: "Description A",
      brand: "Marque A",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: ["https://example.com/a-1.jpg", "https://example.com/a-2.jpg"],
      freeShipping: false,
      variants: {
        create: [
          { name: "Standard", sku: `GPV-${runId}-A1`, priceDelta: 0, stock: 10 },
          { name: "Premium", sku: `GPV-${runId}-A2`, priceDelta: 50000, stock: 3 },
        ],
      },
    },
    include: { variants: true },
  })
  const productB = await prisma.product.create({
    data: {
      name: "Produit GPV B",
      slug: `gpv-prod-b-${runId}`,
      description: "Description B",
      brand: "Marque B",
      categoryId: category.id,
      price: 50000,
      specs: {},
      images: [],
      freeShipping: true,
      variants: {
        create: [{ name: "Unique", sku: `GPV-${runId}-B1`, priceDelta: 0, stock: 5 }],
      },
    },
    include: { variants: true },
  })
  variantStandard = productA.variants.find((v) => v.name === "Standard")!.id
  variantPremium = productA.variants.find((v) => v.name === "Premium")!.id
  variantUnique = productB.variants.find((v) => v.name === "Unique")!.id
})

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: "gpv-prod-" } } })
  await prisma.category.deleteMany({ where: { slug: `gpv-cat-${runId}` } })
  await prisma.$disconnect()
})

beforeEach(() => {
  resetCookieStoreMock()
})

describe("getPanierVisiteur", () => {
  it("yields an empty CartData when the cookie holds no article", async () => {
    expect(await getPanierVisiteur()).toEqual({ lines: [], subtotal: 0, itemCount: 0 })

    setCookie(NOM_COOKIE_PANIER_VISITEUR, "[]")
    expect(await getPanierVisiteur()).toEqual({ lines: [], subtotal: 0, itemCount: 0 })
  })

  it("prices every article from database variant prices, exactly like a Client's lines", async () => {
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantPremium, quantity: 1 },
        { variantId: variantUnique, quantity: 3 },
      ])
    )

    const cart = await getPanierVisiteur()

    expect(cart.lines.map((line) => line.articlePanierId)).toEqual([
      variantStandard,
      variantPremium,
      variantUnique,
    ])
    expect(cart.lines[0]).toMatchObject({
      articlePanierId: variantStandard,
      variantId: variantStandard,
      variantName: "Standard",
      productName: "Produit GPV A",
      image: "https://example.com/a-1.jpg",
      unitPrice: 100000,
      quantity: 2,
      lineTotal: 200000,
      stock: 10,
      freeShipping: false,
    })
    expect(cart.lines[1]).toMatchObject({
      variantName: "Premium",
      unitPrice: 150000,
      quantity: 1,
      lineTotal: 150000,
    })
    expect(cart.lines[2]).toMatchObject({
      productName: "Produit GPV B",
      image: null,
      unitPrice: 50000,
      quantity: 3,
      lineTotal: 150000,
      freeShipping: true,
    })
    expect(cart.subtotal).toBe(200000 + 150000 + 150000)
    expect(cart.itemCount).toBe(6)
  })

  it("skips stale articles whose variant vanished from the database", async () => {
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: "variante-fantome", quantity: 4 },
        { variantId: variantUnique, quantity: 1 },
      ])
    )

    const cart = await getPanierVisiteur()

    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].variantId).toBe(variantUnique)
    expect(cart.subtotal).toBe(50000)
    expect(cart.itemCount).toBe(1)
  })
})
