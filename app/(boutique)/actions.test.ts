import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { sessionUserMock } from "@/test/navigation-mocks"

const cookieJar = vi.hoisted(() => new Map<string, string>())

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value)
    },
    delete: (name: string) => {
      cookieJar.delete(name)
    },
  }),
}))
vi.mock("@/lib/use-cases/get-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getSessionUser: h.sessionUserMock }
})

import {
  addToCartAction,
  removeCartItemAction,
  updateCartItemQuantityAction,
} from "./actions"
import { prisma } from "@/lib/db"
import { parsePanierVisiteur, serializePanierVisiteur } from "@/lib/panier-visiteur"

const PANIER_COOKIE = "panier-visiteur"
const runId = randomUUID().slice(0, 8)

let userIdA: string
let variantA: string
let variantB: string

function commeClient(userId: string) {
  sessionUserMock.mockResolvedValue({ id: userId })
}

function commeVisiteur() {
  sessionUserMock.mockResolvedValue(null)
}

function panierCookie(): string | undefined {
  return cookieJar.get(PANIER_COOKIE)
}

function articlesDuCookie() {
  return parsePanierVisiteur(panierCookie())
}

async function compterArticlesClient(): Promise<number> {
  return prisma.cartItem.count({
    where: { user: { email: { startsWith: `boutique-actions-${runId}-` } } },
  })
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `boutique-actions-${runId}-a@test.ma`,
      name: "Utilisateur A",
    },
  })
  userIdA = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `boutique-actions-cat-${runId}` },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Actions",
      slug: `boutique-actions-prod-${runId}`,
      description: "Description",
      brand: "Marque Actions",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: ["https://example.com/a.jpg"],
      freeShipping: false,
      variants: {
        create: [
          { name: "Standard", sku: `ACT-${runId}-A1`, priceDelta: 0, stock: 10 },
          { name: "Premium", sku: `ACT-${runId}-A2`, priceDelta: 50000, stock: 3 },
        ],
      },
    },
    include: { variants: true },
  })
  variantA = product.variants.find((v) => v.name === "Standard")!.id
  variantB = product.variants.find((v) => v.name === "Premium")!.id
})

beforeEach(async () => {
  cookieJar.clear()
  sessionUserMock.mockReset()
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `boutique-actions-${runId}-` } } },
  })
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `boutique-actions-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `boutique-actions-${runId}-` } },
  })
  await prisma.product.deleteMany({ where: { slug: `boutique-actions-prod-${runId}` } })
  await prisma.category.deleteMany({ where: { slug: `boutique-actions-cat-${runId}` } })
  await prisma.$disconnect()
})

describe("addToCartAction", () => {
  describe("Compte client owner", () => {
    it("persists the article through the DB use-case and returns true", async () => {
      commeClient(userIdA)

      const ok = await addToCartAction(variantA, 2)

      expect(ok).toBe(true)
      const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })
      expect(item.variantId).toBe(variantA)
      expect(item.quantity).toBe(2)
      expect(panierCookie()).toBeUndefined()
    })

    it("returns false on an invalid quantity and persists nothing", async () => {
      commeClient(userIdA)

      expect(await addToCartAction(variantA, 0)).toBe(false)
      expect(await addToCartAction(variantA, 1.5)).toBe(false)
      expect(await compterArticlesClient()).toBe(0)
    })

    it("returns false on an unknown variant", async () => {
      commeClient(userIdA)

      expect(await addToCartAction("variante-inconnue", 1)).toBe(false)
      expect(await compterArticlesClient()).toBe(0)
    })
  })

  describe("Visiteur owner", () => {
    it("writes the article into the cookie and survives a re-parse", async () => {
      commeVisiteur()

      const ok = await addToCartAction(variantA, 2)

      expect(ok).toBe(true)
      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
      expect(await compterArticlesClient()).toBe(0)
    })

    it("sums quantities per variant across adds", async () => {
      commeVisiteur()

      await addToCartAction(variantA, 2)
      await addToCartAction(variantA, 3)

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 5 }])
    })

    it("refuses an unknown variant with false and leaves the cookie untouched", async () => {
      commeVisiteur()

      expect(await addToCartAction("variante-inconnue", 1)).toBe(false)
      expect(panierCookie()).toBeUndefined()
    })

    it("refuses an invalid quantity with false and leaves the cookie untouched", async () => {
      commeVisiteur()

      expect(await addToCartAction(variantA, 0)).toBe(false)
      expect(await addToCartAction(variantA, 1.5)).toBe(false)
      expect(panierCookie()).toBeUndefined()
    })

    it("refuses a 21st distinct article with cap-atteinte and keeps the cap intact", async () => {
      commeVisiteur()
      const pleins = Array.from({ length: 20 }, (_unused, index) => ({
        variantId: `variant-fantome-${index}`,
        quantity: 1,
      }))
      cookieJar.set(PANIER_COOKIE, serializePanierVisiteur(pleins))

      expect(await addToCartAction("variant-fantome-nouveau", 1)).toBe("cap-atteinte")
      expect(articlesDuCookie()).toHaveLength(20)
      expect(
        articlesDuCookie().some((article) => article.variantId === "variant-fantome-nouveau")
      ).toBe(false)
    })

    it("still sums an already-held article past the cap and returns true", async () => {
      commeVisiteur()
      const pleins = Array.from({ length: 20 }, (_unused, index) => ({
        variantId: index === 0 ? variantA : `variant-fantome-${index}`,
        quantity: 1,
      }))
      cookieJar.set(PANIER_COOKIE, serializePanierVisiteur(pleins))

      expect(await addToCartAction(variantA, 2)).toBe(true)
      const article = articlesDuCookie().find(
        (candidate) => candidate.variantId === variantA
      )
      expect(article?.quantity).toBe(3)
      expect(articlesDuCookie()).toHaveLength(20)
    })

    it("recovers from a tampered cookie by starting a fresh Panier", async () => {
      commeVisiteur()
      cookieJar.set(PANIER_COOKIE, "pas-du-json")

      expect(await addToCartAction(variantA, 1)).toBe(true)
      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 1 }])
    })
  })
})

describe("updateCartItemQuantityAction", () => {
  describe("Compte client owner", () => {
    it("updates the persisted article quantity", async () => {
      commeClient(userIdA)
      await addToCartAction(variantA, 2)
      const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

      await updateCartItemQuantityAction(item.id, 4)

      const updated = await prisma.cartItem.findUniqueOrThrow({ where: { id: item.id } })
      expect(updated.quantity).toBe(4)
    })

    it("silently ignores an invalid quantity", async () => {
      commeClient(userIdA)
      await addToCartAction(variantA, 2)
      const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

      await updateCartItemQuantityAction(item.id, 0)

      const unchanged = await prisma.cartItem.findUniqueOrThrow({ where: { id: item.id } })
      expect(unchanged.quantity).toBe(2)
    })

    it("silently ignores an unknown article", async () => {
      commeClient(userIdA)

      await expect(updateCartItemQuantityAction("article-inconnu", 2)).resolves.toBeUndefined()
    })
  })

  describe("Visiteur owner", () => {
    it("updates the article quantity inside the cookie", async () => {
      commeVisiteur()
      await addToCartAction(variantA, 2)

      await updateCartItemQuantityAction(variantA, 4)

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 4 }])
    })

    it("silently ignores an invalid quantity", async () => {
      commeVisiteur()
      await addToCartAction(variantA, 2)

      await updateCartItemQuantityAction(variantA, 0)

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
    })

    it("silently ignores an unknown article and leaves the cookie untouched", async () => {
      commeVisiteur()
      await addToCartAction(variantA, 2)

      await updateCartItemQuantityAction("article-inconnu", 3)

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
    })

    it("silently ignores an article whose variant vanished from the database", async () => {
      commeVisiteur()
      await addToCartAction(variantA, 2)

      await updateCartItemQuantityAction("variant-fantome", 3)

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
    })
  })
})

describe("removeCartItemAction", () => {
  describe("Compte client owner", () => {
    it("deletes the persisted article", async () => {
      commeClient(userIdA)
      await addToCartAction(variantA, 2)
      const item = await prisma.cartItem.findFirstOrThrow({ where: { userId: userIdA } })

      await removeCartItemAction(item.id)

      expect(await compterArticlesClient()).toBe(0)
    })

    it("silently ignores an unknown article", async () => {
      commeClient(userIdA)

      await expect(removeCartItemAction("article-inconnu")).resolves.toBeUndefined()
    })
  })

  describe("Visiteur owner", () => {
    it("removes only the targeted article from the cookie", async () => {
      commeVisiteur()
      await addToCartAction(variantA, 2)
      await addToCartAction(variantB, 1)

      await removeCartItemAction(variantA)

      expect(articlesDuCookie()).toEqual([{ variantId: variantB, quantity: 1 }])
    })

    it("leaves an empty serialized Panier when the last article is removed", async () => {
      commeVisiteur()
      await addToCartAction(variantA, 2)

      await removeCartItemAction(variantA)

      expect(panierCookie()).toBe("[]")
      expect(articlesDuCookie()).toEqual([])
    })

    it("silently ignores an unknown article and leaves the cookie untouched", async () => {
      commeVisiteur()
      await addToCartAction(variantA, 2)

      await removeCartItemAction("article-inconnu")

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
    })
  })
})
