import { randomUUID } from "node:crypto"

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  serializePanierVisiteur,
  type ArticlePanierVisiteur,
} from "@/lib/panier-visiteur"
import { addToCart } from "@/lib/use-cases/cart"
import {
  deletedCookieNames,
  hasCookie,
  resetCookieStoreMock,
  setCookie,
} from "@/test/cookie-store"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

import { replayPanierVisiteur } from "./replay-panier-visiteur"

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `rejou-${runId}-${suffix}@test.ma`

let userId: string
let variantA: string
let variantB: string
const varianteInconnue = randomUUID()

function panierCookie(articles: ArticlePanierVisiteur[]) {
  setCookie(NOM_COOKIE_PANIER_VISITEUR, serializePanierVisiteur(articles))
}

async function lignesPanier() {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { variantId: "asc" },
  })
  return items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }))
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { id: randomUUID(), email: email("a"), name: "Utilisateur Rejou" },
  })
  userId = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `rejou-cat-${runId}` },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Rejou",
      slug: `rejou-prod-${runId}`,
      description: "Description",
      brand: "Marque Rejou",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          { name: "Standard", sku: `REJOU-${runId}-A1`, priceDelta: 0, stock: 10 },
          { name: "Premium", sku: `REJOU-${runId}-A2`, priceDelta: 50000, stock: 3 },
        ],
      },
    },
    include: { variants: true },
  })
  variantA = product.variants.find((v) => v.name === "Standard")!.id
  variantB = product.variants.find((v) => v.name === "Premium")!.id
})

beforeEach(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `rejou-${runId}-` } } },
  })
  resetCookieStoreMock()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `rejou-${runId}-` } } },
  })
  await prisma.user.deleteMany({ where: { email: { startsWith: `rejou-${runId}-` } } })
  await prisma.product.deleteMany({ where: { slug: `rejou-prod-${runId}` } })
  await prisma.category.deleteMany({ where: { slug: `rejou-cat-${runId}` } })
  await prisma.$disconnect()
})

describe("replayPanierVisiteur", () => {
  it("lands every article through addToCart, summing into persisted lines, then deletes the cookie", async () => {
    await addToCart(userId, variantA, 2)
    panierCookie([
      { variantId: variantA, quantity: 3 },
      { variantId: variantB, quantity: 1 },
    ])

    await replayPanierVisiteur(userId)

    expect(await lignesPanier()).toEqual([
      { variantId: variantA, quantity: 5 },
      { variantId: variantB, quantity: 1 },
    ])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
    expect(deletedCookieNames).toEqual([NOM_COOKIE_PANIER_VISITEUR])
  })

  it("skips a stale variant quietly and still lands the valid ones", async () => {
    panierCookie([
      { variantId: varianteInconnue, quantity: 4 },
      { variantId: variantA, quantity: 2 },
    ])

    await replayPanierVisiteur(userId)

    expect(await lignesPanier()).toEqual([{ variantId: variantA, quantity: 2 }])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
  })

  it("survives an addToCart failure mid-replay and still deletes the cookie", async () => {
    vi.spyOn(prisma.cartItem, "upsert").mockRejectedValueOnce(new Error("boom"))
    panierCookie([
      { variantId: variantB, quantity: 1 },
      { variantId: variantA, quantity: 2 },
    ])

    await replayPanierVisiteur(userId)

    expect(await lignesPanier()).toEqual([{ variantId: variantA, quantity: 2 }])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
  })

  it("deletes an unreadable or empty cookie without touching the Panier", async () => {
    setCookie(NOM_COOKIE_PANIER_VISITEUR, "{oops")
    await replayPanierVisiteur(userId)
    expect(await lignesPanier()).toEqual([])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)

    resetCookieStoreMock()
    panierCookie([])
    await replayPanierVisiteur(userId)
    expect(await lignesPanier()).toEqual([])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
  })

  it("does nothing when no Visiteur cookie is present", async () => {
    await replayPanierVisiteur(userId)

    expect(await lignesPanier()).toEqual([])
    expect(deletedCookieNames).toEqual([])
  })
})
