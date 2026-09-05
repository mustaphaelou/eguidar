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
  deletedCookieNames,
  hasCookie,
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

import {
  ajouterArticleAuPanier,
  compterArticlesDuPanier,
  lirePanier,
  lirePanierClient,
  modifierQuantiteArticlePanier,
  rejouerPanierVisiteur,
  retirerArticleDuPanier,
} from "./panier"

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"
const serializePanierVisiteur = (
  articles: readonly { variantId: string; quantity: number }[]
) => JSON.stringify(articles)
const MESSAGE_CAP_ATTEINTE = "Votre panier est plein : 20 articles maximum."
const MESSAGE_QUANTITE_INVALIDE =
  "Quantité invalide : la quantité doit être un entier d'au moins 1."
const MESSAGE_VARIANTE_INCONNUE = "Cet article n'est plus disponible."
const MESSAGE_ARTICLE_INCONNU = "Cet article est introuvable dans votre panier."

const runId = randomUUID().slice(0, 8)
const emailPrefix = `panier-deep-${runId}-`

let userId: string
let userIdB: string
let variantStandard: string
let variantPremium: string
let variantesCap: string[]

function commeClient(id: string) {
  sessionUserMock.mockResolvedValue({ id })
}

function commeVisiteur() {
  sessionUserMock.mockResolvedValue(null)
}

function cookiePanier(): { variantId: string; quantity: number }[] {
  const brut = readCookie(NOM_COOKIE_PANIER_VISITEUR)
  return brut
    ? (JSON.parse(brut) as { variantId: string; quantity: number }[])
    : []
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
  userIdB = (
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `${emailPrefix}b@test.ma`,
        name: "Utilisateur B",
      },
    })
  ).id

  const category = await prisma.category.create({
    data: {
      name: `Catégorie ${runId}`,
      slug: `panier-deep-cat-${runId}`,
    },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Panier Deep",
      slug: `panier-deep-prod-${runId}`,
      description: "Description A",
      brand: "Marque A",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: ["https://example.com/pd-1.jpg"],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `PDD-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `PDD-${runId}-A2`,
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

  const productCap = await prisma.product.create({
    data: {
      name: "Produit Panier Cap",
      slug: `panier-deep-cap-${runId}`,
      description: "Description Cap",
      brand: "Marque Cap",
      categoryId: category.id,
      price: 10000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: Array.from({ length: 21 }, (_, i) => ({
          name: `Cap ${i + 1}`,
          sku: `PDD-CAP-${runId}-${i + 1}`,
          priceDelta: 0,
          stock: 50,
        })),
      },
    },
    include: { variants: true },
  })
  variantesCap = productCap.variants
    .map((v) => v.id)
    .sort((a, b) => a.localeCompare(b))
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
    where: { slug: { startsWith: "panier-deep-" } },
  })
  await prisma.category.deleteMany({
    where: { slug: `panier-deep-cat-${runId}` },
  })
  await prisma.$disconnect()
})

describe("lirePanier — lecture du Panier", () => {
  describe("Client (session active — Panier persisté)", () => {
    it("reads the Client's persisted Panier priced from the database", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 2)
      await ajouterArticleAuPanier(variantPremium, 1)

      const panier = await lirePanier()

      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId, variantId: variantStandard },
      })
      expect(panier.lines[0]).toMatchObject({
        articlePanierId: item.id,
        variantId: variantStandard,
        variantName: "Standard",
        productName: "Produit Panier Deep",
        image: "https://example.com/pd-1.jpg",
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

    it("returns the data shape only — sans écho du Propriétaire", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 1)

      const panier = await lirePanier()

      expect(Object.keys(panier).sort()).toEqual([
        "itemCount",
        "lines",
        "subtotal",
      ])
    })

    it("yields zero totals for an empty persisted Panier", async () => {
      commeClient(userId)

      await expect(lirePanier()).resolves.toEqual({
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

      const panier = await lirePanier()

      expect(panier.lines.map((ligne) => ligne.articlePanierId)).toEqual([
        variantStandard,
        variantPremium,
      ])
      expect(panier.lines[0]).toMatchObject({
        variantId: variantStandard,
        variantName: "Standard",
        productName: "Produit Panier Deep",
        image: "https://example.com/pd-1.jpg",
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

      await expect(lirePanier()).resolves.toEqual({
        lines: [],
        subtotal: 0,
        itemCount: 0,
      })

      setCookie(NOM_COOKIE_PANIER_VISITEUR, "[]")
      await expect(lirePanier()).resolves.toEqual({
        lines: [],
        subtotal: 0,
        itemCount: 0,
      })
    })

    it("yields an empty Panier when the cookie value is corrupted", async () => {
      commeVisiteur()
      setCookie(NOM_COOKIE_PANIER_VISITEUR, "panier-corrompu{{{pas-du-json")

      await expect(lirePanier()).resolves.toEqual({
        lines: [],
        subtotal: 0,
        itemCount: 0,
      })
      await expect(compterArticlesDuPanier()).resolves.toBe(0)
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

      const panier = await lirePanier()

      expect(panier.lines).toHaveLength(1)
      expect(panier.lines[0].variantId).toBe(variantPremium)
      expect(panier.subtotal).toBe(150000)
      expect(panier.itemCount).toBe(1)
    })
  })
})

describe("compterArticlesDuPanier — comptage du Panier", () => {
  describe("Client (session active — Panier persisté)", () => {
    it("counts the somme des quantités, not the number of lines", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 2)
      await ajouterArticleAuPanier(variantPremium, 3)

      const compte = await compterArticlesDuPanier()

      expect(compte).toBe(5)
      expect(compte).not.toBe(2)
    })

    it("yields zero for an empty persisted Panier", async () => {
      commeClient(userId)

      await expect(compterArticlesDuPanier()).resolves.toBe(0)
    })
  })

  describe("Visiteur (sans session — Panier cookie)", () => {
    it("counts the somme des quantités from the cookie, not the number of lines", async () => {
      commeVisiteur()
      setCookie(
        NOM_COOKIE_PANIER_VISITEUR,
        serializePanierVisiteur([
          { variantId: variantStandard, quantity: 3 },
          { variantId: variantPremium, quantity: 2 },
        ])
      )

      const compte = await compterArticlesDuPanier()

      expect(compte).toBe(5)
      expect(compte).not.toBe(2)
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

      await expect(compterArticlesDuPanier()).resolves.toBe(1)
    })

    it("yields zero when the cookie holds no article", async () => {
      commeVisiteur()

      await expect(compterArticlesDuPanier()).resolves.toBe(0)
    })
  })
})

describe("ajouterArticleAuPanier — ajout d'un article", () => {
  describe("Client (session active — Panier persisté)", () => {
    it("adds an article to the persisted Panier and merges repeated adds", async () => {
      commeClient(userId)

      await expect(ajouterArticleAuPanier(variantStandard, 2)).resolves.toEqual(
        { ok: true }
      )
      await expect(ajouterArticleAuPanier(variantStandard, 1)).resolves.toEqual(
        { ok: true }
      )

      const panier = await lirePanier()
      expect(panier.lines).toHaveLength(1)
      expect(panier.lines[0]).toMatchObject({
        variantId: variantStandard,
        quantity: 3,
        lineTotal: 300000,
      })
      expect(panier.itemCount).toBe(3)
    })

    it("answers with a self-carrying refusal without touching the Panier", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 2)

      await expect(ajouterArticleAuPanier(variantStandard, 0)).resolves.toEqual(
        {
          ok: false,
          motif: "quantite-invalide",
          message: MESSAGE_QUANTITE_INVALIDE,
        }
      )
      await expect(ajouterArticleAuPanier(variantStandard, -1)).resolves.toEqual(
        {
          ok: false,
          motif: "quantite-invalide",
          message: MESSAGE_QUANTITE_INVALIDE,
        }
      )
      await expect(
        ajouterArticleAuPanier(variantStandard, 1.5)
      ).resolves.toEqual({
        ok: false,
        motif: "quantite-invalide",
        message: MESSAGE_QUANTITE_INVALIDE,
      })
      await expect(
        ajouterArticleAuPanier("variante-fantome", 1)
      ).resolves.toEqual({
        ok: false,
        motif: "variante-inconnue",
        message: MESSAGE_VARIANTE_INCONNUE,
      })

      const panier = await lirePanier()
      expect(panier.lines[0]).toMatchObject({
        variantId: variantStandard,
        quantity: 2,
      })
      expect(await prisma.cartItem.count({ where: { userId } })).toBe(1)
    })

    it("isole le Panier de chaque Compte : un Client ne lit ni n'écrit celui d'un autre", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 2)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId, variantId: variantStandard },
      })

      commeClient(userIdB)

      await expect(lirePanier()).resolves.toEqual({
        lines: [],
        subtotal: 0,
        itemCount: 0,
      })
      await expect(
        modifierQuantiteArticlePanier(item.id, 2)
      ).resolves.toMatchObject({ ok: false, motif: "article-inconnu" })
      await expect(retirerArticleDuPanier(item.id)).resolves.toMatchObject({
        ok: false,
        motif: "article-inconnu",
      })
      expect(await prisma.cartItem.count({ where: { userId } })).toBe(1)
    })
  })

  describe("Visiteur (sans session — Panier cookie)", () => {
    it("adds an article to the cookie Panier", async () => {
      commeVisiteur()

      await expect(ajouterArticleAuPanier(variantStandard, 2)).resolves.toEqual(
        { ok: true }
      )
      await expect(ajouterArticleAuPanier(variantPremium, 1)).resolves.toEqual({
        ok: true,
      })

      expect(cookiePanier()).toEqual([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantPremium, quantity: 1 },
      ])
      const panier = await lirePanier()
      expect(panier.lines.map((ligne) => ligne.articlePanierId)).toEqual([
        variantStandard,
        variantPremium,
      ])
      expect(panier.subtotal).toBe(200000 + 150000)
    })

    it("merges repeated adds of the same variant under a single line", async () => {
      commeVisiteur()

      await ajouterArticleAuPanier(variantStandard, 2)
      await ajouterArticleAuPanier(variantStandard, 1)

      expect(cookiePanier()).toEqual([
        { variantId: variantStandard, quantity: 3 },
      ])
    })

    it("caps the cookie at 20 distinct articles with the full-cart message", async () => {
      commeVisiteur()
      for (const variantId of variantesCap.slice(0, 20)) {
        await expect(ajouterArticleAuPanier(variantId, 1)).resolves.toEqual({
          ok: true,
        })
      }

      await expect(
        ajouterArticleAuPanier(variantesCap[20], 1)
      ).resolves.toEqual({
        ok: false,
        motif: "cap-atteinte",
        message: MESSAGE_CAP_ATTEINTE,
      })

      const panier = await lirePanier()
      expect(panier.lines).toHaveLength(20)
      expect(panier.lines[0].image).toBeNull()
      expect(cookiePanier()).toHaveLength(20)
    })

    it("still merges into an already-present article beyond the cap", async () => {
      commeVisiteur()
      for (const variantId of variantesCap.slice(0, 20)) {
        await ajouterArticleAuPanier(variantId, 1)
      }

      await expect(ajouterArticleAuPanier(variantesCap[0], 4)).resolves.toEqual(
        { ok: true }
      )

      expect(cookiePanier()).toEqual([
        { variantId: variantesCap[0], quantity: 5 },
        ...variantesCap.slice(1, 20).map((variantId) => ({
          variantId,
          quantity: 1,
        })),
      ])
    })

    it("answers with a self-carrying refusal without touching the cookie", async () => {
      commeVisiteur()
      await ajouterArticleAuPanier(variantStandard, 2)

      await expect(ajouterArticleAuPanier(variantStandard, 0)).resolves.toEqual(
        {
          ok: false,
          motif: "quantite-invalide",
          message: MESSAGE_QUANTITE_INVALIDE,
        }
      )
      await expect(
        ajouterArticleAuPanier("variante-fantome", 1)
      ).resolves.toEqual({
        ok: false,
        motif: "variante-inconnue",
        message: MESSAGE_VARIANTE_INCONNUE,
      })

      expect(cookiePanier()).toEqual([
        { variantId: variantStandard, quantity: 2 },
      ])
    })
  })
})

describe("modifierQuantiteArticlePanier et retirerArticleDuPanier — écritures", () => {
  describe("Client (session active — Panier persisté)", () => {
    it("changes an article quantity identified by the Variante", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 2)
      const item = await prisma.cartItem.findFirstOrThrow({
        where: { userId, variantId: variantStandard },
      })

      await expect(
        modifierQuantiteArticlePanier(variantStandard, 5)
      ).resolves.toEqual({ ok: true })

      const panier = await lirePanier()
      expect(panier.lines[0]).toMatchObject({
        articlePanierId: item.id,
        variantId: variantStandard,
        quantity: 5,
        lineTotal: 500000,
      })
      expect(await prisma.cartItem.count({ where: { userId } })).toBe(1)
    })

    it("removes an article identified by the Variante", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 2)
      await ajouterArticleAuPanier(variantPremium, 1)

      await expect(retirerArticleDuPanier(variantStandard)).resolves.toEqual({
        ok: true,
      })

      const panier = await lirePanier()
      expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
        variantPremium,
      ])
      expect(await prisma.cartItem.count({ where: { userId } })).toBe(1)
    })

    it("answers with a self-carrying refusal without touching the Panier", async () => {
      commeClient(userId)
      await ajouterArticleAuPanier(variantStandard, 2)

      await expect(
        modifierQuantiteArticlePanier("article-fantome", 1)
      ).resolves.toEqual({
        ok: false,
        motif: "article-inconnu",
        message: MESSAGE_ARTICLE_INCONNU,
      })
      await expect(
        modifierQuantiteArticlePanier(variantStandard, 0)
      ).resolves.toEqual({
        ok: false,
        motif: "quantite-invalide",
        message: MESSAGE_QUANTITE_INVALIDE,
      })
      await expect(retirerArticleDuPanier("article-fantome")).resolves.toEqual({
        ok: false,
        motif: "article-inconnu",
        message: MESSAGE_ARTICLE_INCONNU,
      })

      const panier = await lirePanier()
      expect(panier.lines[0]).toMatchObject({
        variantId: variantStandard,
        quantity: 2,
      })
    })
  })

  describe("Visiteur (sans session — Panier cookie)", () => {
    it("changes an article quantity identified by variantId", async () => {
      commeVisiteur()
      await ajouterArticleAuPanier(variantStandard, 2)

      await expect(
        modifierQuantiteArticlePanier(variantStandard, 4)
      ).resolves.toEqual({ ok: true })

      const panier = await lirePanier()
      expect(panier.lines[0]).toMatchObject({
        articlePanierId: variantStandard,
        variantId: variantStandard,
        quantity: 4,
        lineTotal: 400000,
      })
      expect(cookiePanier()).toEqual([
        { variantId: variantStandard, quantity: 4 },
      ])
    })

    it("removes an article identified by variantId", async () => {
      commeVisiteur()
      await ajouterArticleAuPanier(variantStandard, 2)
      await ajouterArticleAuPanier(variantPremium, 1)

      await expect(retirerArticleDuPanier(variantStandard)).resolves.toEqual({
        ok: true,
      })

      const panier = await lirePanier()
      expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
        variantPremium,
      ])
      expect(cookiePanier()).toEqual([
        { variantId: variantPremium, quantity: 1 },
      ])
    })

    it("answers with a self-carrying refusal without touching the cookie", async () => {
      commeVisiteur()
      await ajouterArticleAuPanier(variantStandard, 2)

      await expect(
        modifierQuantiteArticlePanier("variante-fantome", 1)
      ).resolves.toEqual({
        ok: false,
        motif: "article-inconnu",
        message: MESSAGE_ARTICLE_INCONNU,
      })
      await expect(retirerArticleDuPanier("variante-fantome")).resolves.toEqual(
        {
          ok: false,
          motif: "article-inconnu",
          message: MESSAGE_ARTICLE_INCONNU,
        }
      )

      expect(cookiePanier()).toEqual([
        { variantId: variantStandard, quantity: 2 },
      ])
    })
  })
})

describe("rejouerPanierVisiteur — rejeu du Panier Visiteur à la connexion", () => {
  it("sums the cookie articles into the persisted Panier, skips dead variants and clears the cookie", async () => {
    await prisma.cartItem.create({
      data: { userId, variantId: variantStandard, quantity: 3 },
    })
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantPremium, quantity: 1 },
        { variantId: "variante-fantome", quantity: 5 },
      ])
    )

    await expect(rejouerPanierVisiteur(userId)).resolves.toBeUndefined()

    const items = await prisma.cartItem.findMany({
      where: { userId },
      orderBy: { variantId: "asc" },
    })
    expect(
      items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      }))
    ).toEqual([
      { variantId: variantStandard, quantity: 5 },
      { variantId: variantPremium, quantity: 1 },
    ])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
    expect(deletedCookieNames).toEqual([NOM_COOKIE_PANIER_VISITEUR])
  })

  it("touches nothing when no Visiteur cookie is present", async () => {
    await prisma.cartItem.create({
      data: { userId, variantId: variantStandard, quantity: 3 },
    })

    await rejouerPanierVisiteur(userId)

    expect(deletedCookieNames).toEqual([])
    expect(
      await prisma.cartItem.findFirstOrThrow({ where: { userId } })
    ).toMatchObject({ quantity: 3 })
  })
})

describe("lirePanierClient — couture dédiée à la Commande", () => {
  it("returns the persisted Panier priced from the database, ignoring any Visiteur cookie", async () => {
    await prisma.cartItem.create({
      data: { userId, variantId: variantStandard, quantity: 2 },
    })
    await prisma.cartItem.create({
      data: { userId, variantId: variantPremium, quantity: 1 },
    })
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: "variante-fantome", quantity: 7 }])
    )

    const panier = await lirePanierClient(userId)

    expect(panier.lines.map((ligne) => ligne.variantId)).toEqual([
      variantStandard,
      variantPremium,
    ])
    expect(panier.lines[0]).toMatchObject({
      variantName: "Standard",
      unitPrice: 100000,
      quantity: 2,
      lineTotal: 200000,
      stock: 10,
    })
    expect(panier.subtotal).toBe(200000 + 150000)
    expect(panier.itemCount).toBe(3)
  })

  it("yields an empty Panier with zero totals for a Compte sans article", async () => {
    await expect(lirePanierClient(userId)).resolves.toEqual({
      lines: [],
      subtotal: 0,
      itemCount: 0,
    })
  })
})
