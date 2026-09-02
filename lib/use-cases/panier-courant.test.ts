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
import {
  readCookie,
  resetCookieStoreMock,
  setCookie,
} from "@/test/cookie-store"
import { sessionUserMock } from "@/test/navigation-mocks"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/get-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getSessionUser: h.sessionUserMock }
})

import { ajouterArticleAuPanier } from "@/lib/panier"
import {
  ajouterArticleAuPanierCourant,
  lirePanierCourant,
  modifierQuantiteArticlePanierCourant,
  retirerArticleDuPanierCourant,
} from "./panier-courant"

const runId = randomUUID().slice(0, 8)
const emailPrefix = `panier-courant-${runId}-`

let userId: string
let variantStandard: string
let variantPremium: string

function commeClient(id: string) {
  sessionUserMock.mockResolvedValue({ id })
}

function commeVisiteur() {
  sessionUserMock.mockResolvedValue(null)
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${emailPrefix}a@test.ma`,
      name: "Utilisateur A",
    },
  })
  userId = user.id

  const category = await prisma.category.create({
    data: {
      name: `Catégorie ${runId}`,
      slug: `panier-courant-cat-${runId}`,
    },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Panier Courant",
      slug: `panier-courant-prod-${runId}`,
      description: "Description A",
      brand: "Marque A",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: ["https://example.com/pc-1.jpg"],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `PCC-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `PCC-${runId}-A2`,
            priceDelta: 50000,
            stock: 3,
          },
        ],
      },
    },
    include: { variants: true },
  })
  variantStandard = product.variants.find((v) => v.name === "Standard")!.id
  variantPremium = product.variants.find((v) => v.name === "Premium")!.id
})

beforeEach(async () => {
  resetCookieStoreMock()
  sessionUserMock.mockReset()
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: emailPrefix } } },
  })
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: emailPrefix } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: emailPrefix } },
  })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: "panier-courant-prod-" } },
  })
  await prisma.category.deleteMany({
    where: { slug: `panier-courant-cat-${runId}` },
  })
  await prisma.$disconnect()
})

describe("lirePanierCourant — lecture du Panier courant", () => {
  describe("Client (session active — Panier persisté)", () => {
    it("reads the Client's persisted Panier priced from the database", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(
        { role: "client", compteId: userId },
        variantStandard,
        2
      )
      await ajouterArticleAuPanier(
        { role: "client", compteId: userId },
        variantPremium,
        1
      )

      const panier = await lirePanierCourant()

      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId, variantId: variantStandard },
      })
      expect(panier.lines[0]).toMatchObject({
        articlePanierId: item.id,
        variantId: variantStandard,
        variantName: "Standard",
        productName: "Produit Panier Courant",
        image: "https://example.com/pc-1.jpg",
        unitPrice: 100000,
        quantity: 2,
        lineTotal: 200000,
      })
      expect(panier.lines[1]).toMatchObject({
        variantId: variantPremium,
        unitPrice: 150000,
        quantity: 1,
        lineTotal: 150000,
      })
      expect(panier.subtotal).toBe(200000 + 150000)
      expect(panier.itemCount).toBe(3)
    })

    it("returns the data shape only — no owner echo", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(
        { role: "client", compteId: userId },
        variantStandard,
        1
      )

      const panier = await lirePanierCourant()

      expect(Object.keys(panier).sort()).toEqual([
        "itemCount",
        "lines",
        "subtotal",
      ])
    })

    it("yields zero totals for an empty persisted Panier", async () => {
      commeClient(userId)

      await expect(lirePanierCourant()).resolves.toEqual({
        lines: [],
        subtotal: 0,
        itemCount: 0,
      })
    })
  })

  describe("Visiteur (sans session — Panier cookie)", () => {
    it("reads the cookie Panier priced from the database", async () => {
      commeVisiteur()
      setCookie(
        NOM_COOKIE_PANIER_VISITEUR,
        serializePanierVisiteur([
          { variantId: variantStandard, quantity: 2 },
          { variantId: variantPremium, quantity: 1 },
        ])
      )

      const panier = await lirePanierCourant()

      expect(panier.lines.map((ligne) => ligne.articlePanierId)).toEqual([
        variantStandard,
        variantPremium,
      ])
      expect(panier.lines[0]).toMatchObject({
        variantId: variantStandard,
        variantName: "Standard",
        productName: "Produit Panier Courant",
        unitPrice: 100000,
        quantity: 2,
        lineTotal: 200000,
      })
      expect(panier.subtotal).toBe(200000 + 150000)
      expect(panier.itemCount).toBe(3)
      expect(Object.keys(panier).sort()).toEqual([
        "itemCount",
        "lines",
        "subtotal",
      ])
    })

    it("yields an empty Panier when the cookie holds no article", async () => {
      commeVisiteur()

      await expect(lirePanierCourant()).resolves.toEqual({
        lines: [],
        subtotal: 0,
        itemCount: 0,
      })
    })

    it("skips stale cookie articles whose variant vanished from the database", async () => {
      commeVisiteur()
      setCookie(
        NOM_COOKIE_PANIER_VISITEUR,
        serializePanierVisiteur([
          { variantId: "variante-fantome", quantity: 4 },
          { variantId: variantPremium, quantity: 1 },
        ])
      )

      const panier = await lirePanierCourant()

      expect(panier.lines).toHaveLength(1)
      expect(panier.lines[0].variantId).toBe(variantPremium)
      expect(panier.subtotal).toBe(150000)
      expect(panier.itemCount).toBe(1)
    })
  })
})

describe("écritures du Panier courant — ajouter, modifier, retirer", () => {
  describe("Client (session active — Panier persisté)", () => {
    it("adds an article to the persisted Panier and merges repeated adds", async () => {
      commeClient(userId)

      await expect(
        ajouterArticleAuPanierCourant(variantStandard, 2)
      ).resolves.toEqual({ ok: true })
      await expect(
        ajouterArticleAuPanierCourant(variantStandard, 1)
      ).resolves.toEqual({ ok: true })

      const panier = await lirePanierCourant()
      expect(panier.lines).toHaveLength(1)
      expect(panier.lines[0]).toMatchObject({
        variantId: variantStandard,
        quantity: 3,
        lineTotal: 300000,
      })
      expect(panier.itemCount).toBe(3)
    })

    it("changes an article quantity identified by the persisted id", async () => {
      commeClient(userId)
      await ajouterArticleAuPanierCourant(variantStandard, 2)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId, variantId: variantStandard },
      })

      await expect(
        modifierQuantiteArticlePanierCourant(item.id, 5)
      ).resolves.toEqual({ ok: true })

      const panier = await lirePanierCourant()
      expect(panier.lines[0]).toMatchObject({
        articlePanierId: item.id,
        variantId: variantStandard,
        quantity: 5,
        lineTotal: 500000,
      })
    })

    it("removes an article identified by the persisted id", async () => {
      commeClient(userId)
      await ajouterArticleAuPanierCourant(variantStandard, 2)
      await ajouterArticleAuPanierCourant(variantPremium, 1)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId, variantId: variantStandard },
      })

      await expect(retirerArticleDuPanierCourant(item.id)).resolves.toEqual({
        ok: true,
      })

      const panier = await lirePanierCourant()
      expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
        variantPremium,
      ])
      expect(await prisma.cartItem.count({ where: { userId } })).toBe(1)
    })

    it("answers with the refusal motif without touching the Panier", async () => {
      commeClient(userId)
      await ajouterArticleAuPanierCourant(variantStandard, 2)

      await expect(
        ajouterArticleAuPanierCourant(variantStandard, 0)
      ).resolves.toEqual({ ok: false, motif: "quantite-invalide" })
      await expect(
        modifierQuantiteArticlePanierCourant("article-fantome", 1)
      ).resolves.toEqual({ ok: false, motif: "article-inconnu" })

      const panier = await lirePanierCourant()
      expect(panier.lines[0]).toMatchObject({
        variantId: variantStandard,
        quantity: 2,
      })
    })
  })

  describe("Visiteur (sans session — Panier cookie)", () => {
    it("adds an article to the cookie Panier", async () => {
      commeVisiteur()

      await expect(
        ajouterArticleAuPanierCourant(variantStandard, 2)
      ).resolves.toEqual({ ok: true })
      await expect(
        ajouterArticleAuPanierCourant(variantPremium, 1)
      ).resolves.toEqual({ ok: true })

      expect(
        parsePanierVisiteur(readCookie(NOM_COOKIE_PANIER_VISITEUR))
      ).toEqual([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantPremium, quantity: 1 },
      ])
      const panier = await lirePanierCourant()
      expect(panier.lines.map((ligne) => ligne.articlePanierId)).toEqual([
        variantStandard,
        variantPremium,
      ])
      expect(panier.subtotal).toBe(200000 + 150000)
    })

    it("changes an article quantity identified by variantId", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierCourant(variantStandard, 2)

      await expect(
        modifierQuantiteArticlePanierCourant(variantStandard, 4)
      ).resolves.toEqual({ ok: true })

      const panier = await lirePanierCourant()
      expect(panier.lines[0]).toMatchObject({
        articlePanierId: variantStandard,
        variantId: variantStandard,
        quantity: 4,
        lineTotal: 400000,
      })
    })

    it("removes an article identified by variantId", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierCourant(variantStandard, 2)
      await ajouterArticleAuPanierCourant(variantPremium, 1)

      await expect(
        retirerArticleDuPanierCourant(variantStandard)
      ).resolves.toEqual({ ok: true })

      const panier = await lirePanierCourant()
      expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
        variantPremium,
      ])
      expect(
        parsePanierVisiteur(readCookie(NOM_COOKIE_PANIER_VISITEUR))
      ).toEqual([{ variantId: variantPremium, quantity: 1 }])
    })

    it("answers with the refusal motif without touching the cookie", async () => {
      commeVisiteur()
      await ajouterArticleAuPanierCourant(variantStandard, 2)

      await expect(
        ajouterArticleAuPanierCourant("variante-fantome", 1)
      ).resolves.toEqual({ ok: false, motif: "variante-inconnue" })
      await expect(
        retirerArticleDuPanierCourant("variante-fantome")
      ).resolves.toEqual({ ok: false, motif: "article-inconnu" })

      expect(
        parsePanierVisiteur(readCookie(NOM_COOKIE_PANIER_VISITEUR))
      ).toEqual([{ variantId: variantStandard, quantity: 2 }])
    })
  })
})
