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

import { sessionCouranteMock } from "@/test/navigation-mocks"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/session-courante", async () => {
  const h = await import("@/test/navigation-mocks")
  return { lireSession: h.sessionCouranteMock }
})

import { resetCookieStoreMock, setCookie } from "@/test/cookie-store"

import { prisma } from "@/lib/db"

import { GET } from "./route"

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"
const serializePanierVisiteur = (
  articles: readonly { variantId: string; quantity: number }[]
) => JSON.stringify(articles)

const runId = randomUUID().slice(0, 8)
const emailPrefix = `panier-http-${runId}-`

let userIdA: string
let variantStandard: string
let variantPremium: string

function commeClient(id: string) {
  sessionCouranteMock.mockResolvedValue({
    id,
    name: "Client Test",
    email: "client@example.ma",
    role: "user",
  })
}

function commeVisiteur() {
  sessionCouranteMock.mockResolvedValue(null)
}

async function demanderLeCompteur(): Promise<Response> {
  return GET(new Request("http://localhost/api/panier"))
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${emailPrefix}a@test.ma`,
      name: "Client A",
    },
  })
  userIdA = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `panier-http-cat-${runId}` },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Panier HTTP",
      slug: `panier-http-prod-${runId}`,
      description: "Description",
      brand: "Marque",
      categoryId: category.id,
      price: 129900,
      specs: {},
      images: ["/images/panier-http.jpg"],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `PHT-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `PHT-${runId}-A2`,
            priceDelta: 1500,
            stock: 5,
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
  sessionCouranteMock.mockReset()
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
    where: { slug: `panier-http-prod-${runId}` },
  })
  await prisma.category.deleteMany({
    where: { slug: `panier-http-cat-${runId}` },
  })
})

describe("GET /api/panier", () => {
  it("répond le nombre d'Articles du panier d'un Visiteur porteur du cookie", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantPremium, quantity: 3 },
      ])
    )

    const reponse = await demanderLeCompteur()

    expect(reponse.status).toBe(200)
    expect(reponse.headers.get("cache-control")).toBe("private, no-store")
    await expect(reponse.json()).resolves.toEqual({ itemCount: 5 })
  })

  it("répond le nombre d'Articles du panier d'un Client avec une Session courante", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 1 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantPremium, quantity: 2 },
    })

    const reponse = await demanderLeCompteur()

    expect(reponse.headers.get("cache-control")).toBe("private, no-store")
    await expect(reponse.json()).resolves.toEqual({ itemCount: 3 })
  })

  it("répond zéro quand le Panier est vide, pour un Visiteur comme pour un Client", async () => {
    commeVisiteur()
    await expect((await demanderLeCompteur()).json()).resolves.toEqual({
      itemCount: 0,
    })

    commeClient(userIdA)
    await expect((await demanderLeCompteur()).json()).resolves.toEqual({
      itemCount: 0,
    })
  })

  it("ne laisse un Visiteur lire le Panier d'un Client, ni l'inverse", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantStandard, quantity: 2 }])
    )
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantPremium, quantity: 7 },
    })

    commeVisiteur()
    await expect((await demanderLeCompteur()).json()).resolves.toEqual({
      itemCount: 2,
    })

    commeClient(userIdA)
    await expect((await demanderLeCompteur()).json()).resolves.toEqual({
      itemCount: 7,
    })
  })

  it("ignore l'Article du panier dont la Variante a disparu, comme la lecture des lignes", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: randomUUID(), quantity: 4 },
        { variantId: variantStandard, quantity: 2 },
      ])
    )

    const reponse = await demanderLeCompteur()

    await expect(reponse.json()).resolves.toEqual({ itemCount: 2 })
  })
})
