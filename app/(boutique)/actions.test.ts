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
import {
  NOM_COOKIE_PANIER_VISITEUR,
  parsePanierVisiteur,
  serializePanierVisiteur,
} from "@/lib/panier-visiteur"
import { sessionUserMock } from "@/test/navigation-mocks"
import {
  readCookie,
  resetCookieStoreMock,
  setCookie,
} from "@/test/cookie-store"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/get-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getSessionUser: h.sessionUserMock }
})

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))

vi.mock("next/cache", () => ({ refresh: refreshMock }))

import {
  ajouterArticleAuPanierAction,
  modifierQuantiteArticlePanierAction,
  retirerArticleDuPanierAction,
} from "./actions"

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
  return readCookie(NOM_COOKIE_PANIER_VISITEUR)
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
          {
            name: "Standard",
            sku: `ACT-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `ACT-${runId}-A2`,
            priceDelta: 50000,
            stock: 3,
          },
        ],
      },
    },
    include: { variants: true },
  })
  variantA = product.variants.find((v) => v.name === "Standard")!.id
  variantB = product.variants.find((v) => v.name === "Premium")!.id
})

beforeEach(async () => {
  resetCookieStoreMock()
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
  await prisma.product.deleteMany({
    where: { slug: `boutique-actions-prod-${runId}` },
  })
  await prisma.category.deleteMany({
    where: { slug: `boutique-actions-cat-${runId}` },
  })
  await prisma.$disconnect()
})

describe("ajouterArticleAuPanierAction", () => {
  describe("Compte client owner", () => {
    it("persists the article through the DB use-case and answers ok", async () => {
      commeClient(userIdA)

      const resultat = await ajouterArticleAuPanierAction(variantA, 2)

      expect(resultat).toEqual({ ok: true })
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId: userIdA },
      })
      expect(item.variantId).toBe(variantA)
      expect(item.quantity).toBe(2)
      expect(panierCookie()).toBeUndefined()
    })

    it("refuses an invalid quantity with the quantite-invalide motif and persists nothing", async () => {
      commeClient(userIdA)

      expect(await ajouterArticleAuPanierAction(variantA, 0)).toEqual({
        ok: false,
        motif: "quantite-invalide",
      })
      expect(await ajouterArticleAuPanierAction(variantA, 1.5)).toEqual({
        ok: false,
        motif: "quantite-invalide",
      })
      expect(await compterArticlesClient()).toBe(0)
    })

    it("refuses an unknown variant with the variante-inconnue motif", async () => {
      commeClient(userIdA)

      expect(
        await ajouterArticleAuPanierAction("variante-inconnue", 1)
      ).toEqual({
        ok: false,
        motif: "variante-inconnue",
      })
      expect(await compterArticlesClient()).toBe(0)
    })
  })

  describe("Visiteur owner", () => {
    it("writes the article into the cookie and survives a re-parse", async () => {
      commeVisiteur()

      const resultat = await ajouterArticleAuPanierAction(variantA, 2)

      expect(resultat).toEqual({ ok: true })
      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
      expect(await compterArticlesClient()).toBe(0)
    })

    it("sums quantities per variant across adds", async () => {
      commeVisiteur()

      await ajouterArticleAuPanierAction(variantA, 2)
      await ajouterArticleAuPanierAction(variantA, 3)

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 5 }])
    })

    it("refuses an unknown variant with the variante-inconnue motif and leaves the cookie untouched", async () => {
      commeVisiteur()

      expect(
        await ajouterArticleAuPanierAction("variante-inconnue", 1)
      ).toEqual({
        ok: false,
        motif: "variante-inconnue",
      })
      expect(panierCookie()).toBeUndefined()
    })

    it("refuses an invalid quantity with the quantite-invalide motif and leaves the cookie untouched", async () => {
      commeVisiteur()

      expect(await ajouterArticleAuPanierAction(variantA, 0)).toEqual({
        ok: false,
        motif: "quantite-invalide",
      })
      expect(await ajouterArticleAuPanierAction(variantA, 1.5)).toEqual({
        ok: false,
        motif: "quantite-invalide",
      })
      expect(panierCookie()).toBeUndefined()
    })

    it("refuses a 21st distinct article with the cap-atteinte motif and keeps the cap intact", async () => {
      commeVisiteur()
      const pleins = Array.from({ length: 20 }, (_unused, index) => ({
        variantId: `variant-fantome-${index}`,
        quantity: 1,
      }))
      setCookie(NOM_COOKIE_PANIER_VISITEUR, serializePanierVisiteur(pleins))

      expect(
        await ajouterArticleAuPanierAction("variant-fantome-nouveau", 1)
      ).toEqual({
        ok: false,
        motif: "cap-atteinte",
      })
      expect(articlesDuCookie()).toHaveLength(20)
      expect(
        articlesDuCookie().some(
          (article) => article.variantId === "variant-fantome-nouveau"
        )
      ).toBe(false)
    })

    it("still sums an already-held article past the cap and answers ok", async () => {
      commeVisiteur()
      const pleins = Array.from({ length: 20 }, (_unused, index) => ({
        variantId: index === 0 ? variantA : `variant-fantome-${index}`,
        quantity: 1,
      }))
      setCookie(NOM_COOKIE_PANIER_VISITEUR, serializePanierVisiteur(pleins))

      expect(await ajouterArticleAuPanierAction(variantA, 2)).toEqual({
        ok: true,
      })
      const article = articlesDuCookie().find(
        (candidate) => candidate.variantId === variantA
      )
      expect(article?.quantity).toBe(3)
      expect(articlesDuCookie()).toHaveLength(20)
    })

    it("recovers from a tampered cookie by starting a fresh Panier", async () => {
      commeVisiteur()
      setCookie(NOM_COOKIE_PANIER_VISITEUR, "pas-du-json")

      expect(await ajouterArticleAuPanierAction(variantA, 1)).toEqual({
        ok: true,
      })
      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 1 }])
    })
  })
})

describe("modifierQuantiteArticlePanierAction", () => {
  describe("Compte client owner", () => {
    it("updates the persisted article quantity and answers ok", async () => {
      commeClient(userIdA)
      await ajouterArticleAuPanierAction(variantA, 2)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId: userIdA },
      })

      const resultat = await modifierQuantiteArticlePanierAction(item.id, 4)

      expect(resultat).toEqual({ ok: true })
      const updated = await prisma.cartItem.findUniqueOrThrow({
        where: { id: item.id },
      })
      expect(updated.quantity).toBe(4)
    })

    it("refuses an invalid quantity with the quantite-invalide motif", async () => {
      commeClient(userIdA)
      await ajouterArticleAuPanierAction(variantA, 2)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId: userIdA },
      })

      expect(await modifierQuantiteArticlePanierAction(item.id, 0)).toEqual({
        ok: false,
        motif: "quantite-invalide",
      })

      const unchanged = await prisma.cartItem.findUniqueOrThrow({
        where: { id: item.id },
      })
      expect(unchanged.quantity).toBe(2)
    })

    it("refuses an unknown article with the article-inconnu motif", async () => {
      commeClient(userIdA)

      expect(
        await modifierQuantiteArticlePanierAction("article-inconnu", 2)
      ).toEqual({
        ok: false,
        motif: "article-inconnu",
      })
    })

    it("answers the quantite-invalide motif before article-inconnu when both apply (quantite checked first)", async () => {
      commeClient(userIdA)

      expect(
        await modifierQuantiteArticlePanierAction("article-inconnu", 0)
      ).toEqual({
        ok: false,
        motif: "quantite-invalide",
      })
    })

    it("refuses another account's article with the article-inconnu motif", async () => {
      commeClient(userIdA)
      await ajouterArticleAuPanierAction(variantA, 2)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId: userIdA },
      })

      commeClient(randomUUID())
      expect(await modifierQuantiteArticlePanierAction(item.id, 4)).toEqual({
        ok: false,
        motif: "article-inconnu",
      })
    })
  })

  describe("Visiteur owner", () => {
    it("updates the article quantity inside the cookie and answers ok", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierAction(variantA, 2)

      const resultat = await modifierQuantiteArticlePanierAction(variantA, 4)

      expect(resultat).toEqual({ ok: true })
      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 4 }])
    })

    it("refuses an invalid quantity with the quantite-invalide motif", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierAction(variantA, 2)

      expect(await modifierQuantiteArticlePanierAction(variantA, 0)).toEqual({
        ok: false,
        motif: "quantite-invalide",
      })

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
    })

    it("refuses an unknown article with the article-inconnu motif and leaves the cookie untouched", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierAction(variantA, 2)

      expect(
        await modifierQuantiteArticlePanierAction("article-inconnu", 3)
      ).toEqual({
        ok: false,
        motif: "article-inconnu",
      })

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
    })

    it("refuses an article whose variant vanished from the database with the variante-inconnue motif", async () => {
      commeVisiteur()
      setCookie(
        NOM_COOKIE_PANIER_VISITEUR,
        serializePanierVisiteur([{ variantId: "variant-fantome", quantity: 1 }])
      )

      expect(
        await modifierQuantiteArticlePanierAction("variant-fantome", 3)
      ).toEqual({
        ok: false,
        motif: "variante-inconnue",
      })

      expect(articlesDuCookie()).toEqual([
        { variantId: "variant-fantome", quantity: 1 },
      ])
    })
  })
})

describe("retirerArticleDuPanierAction", () => {
  describe("Compte client owner", () => {
    it("deletes the persisted article and answers ok", async () => {
      commeClient(userIdA)
      await ajouterArticleAuPanierAction(variantA, 2)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId: userIdA },
      })

      const resultat = await retirerArticleDuPanierAction(item.id)

      expect(resultat).toEqual({ ok: true })
      expect(await compterArticlesClient()).toBe(0)
    })

    it("refuses an unknown article with the article-inconnu motif", async () => {
      commeClient(userIdA)

      expect(await retirerArticleDuPanierAction("article-inconnu")).toEqual({
        ok: false,
        motif: "article-inconnu",
      })
    })
  })

  describe("Visiteur owner", () => {
    it("removes only the targeted article from the cookie and answers ok", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierAction(variantA, 2)
      await ajouterArticleAuPanierAction(variantB, 1)

      const resultat = await retirerArticleDuPanierAction(variantA)

      expect(resultat).toEqual({ ok: true })
      expect(articlesDuCookie()).toEqual([{ variantId: variantB, quantity: 1 }])
    })

    it("leaves an empty serialized Panier when the last article is removed", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierAction(variantA, 2)

      await retirerArticleDuPanierAction(variantA)

      expect(panierCookie()).toBe("[]")
      expect(articlesDuCookie()).toEqual([])
    })

    it("refuses an unknown article with the article-inconnu motif and leaves the cookie untouched", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierAction(variantA, 2)

      expect(await retirerArticleDuPanierAction("article-inconnu")).toEqual({
        ok: false,
        motif: "article-inconnu",
      })

      expect(articlesDuCookie()).toEqual([{ variantId: variantA, quantity: 2 }])
    })
  })
})
