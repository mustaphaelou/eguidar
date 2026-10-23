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
const emailPrefix = `apercu-http-${runId}-`

let userIdA: string
let slugA: string
let slugB: string
let variantStandard: string
let variantPremium: string
let variantGrand: string

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

async function demanderLApercu(): Promise<Response> {
  return GET(new Request("http://localhost/api/panier/apercu"))
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
    data: { name: `Catégorie ${runId}`, slug: `apercu-http-cat-${runId}` },
  })
  slugA = `apercu-http-prod-a-${runId}`
  slugB = `apercu-http-prod-b-${runId}`

  const productA = await prisma.product.create({
    data: {
      name: "Théière Aperçu",
      slug: slugA,
      description: "Description A",
      brand: "Marque A",
      categoryId: category.id,
      price: 129900,
      specs: {},
      images: ["/images/apercu-http-a.jpg"],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `AHT-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `AHT-${runId}-A2`,
            priceDelta: 1500,
            stock: 5,
          },
        ],
      },
    },
    include: { variants: true },
  })
  variantStandard = productA.variants.find((v) => v.name === "Standard")!.id
  variantPremium = productA.variants.find((v) => v.name === "Premium")!.id

  const productB = await prisma.product.create({
    data: {
      name: "Plateau Aperçu",
      slug: slugB,
      description: "Description B",
      brand: "Marque B",
      categoryId: category.id,
      price: 95000,
      specs: {},
      images: [],
      freeShipping: true,
      variants: {
        create: [
          { name: "Grand", sku: `AHT-${runId}-B1`, priceDelta: 0, stock: 3 },
        ],
      },
    },
    include: { variants: true },
  })
  variantGrand = productB.variants[0].id
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
    where: { slug: { in: [slugA, slugB] } },
  })
  await prisma.category.deleteMany({
    where: { slug: `apercu-http-cat-${runId}` },
  })
})

describe("GET /api/panier/apercu", () => {
  it("répond l'état vide d'un Visiteur avec l'invitation à se connecter", async () => {
    commeVisiteur()

    const reponse = await demanderLApercu()

    expect(reponse.status).toBe(200)
    expect(reponse.headers.get("cache-control")).toBe("private, no-store")
    await expect(reponse.json()).resolves.toEqual({
      etat: "vide",
      connecte: false,
    })
  })

  it("répond l'état vide d'un Client sans invitation à se connecter", async () => {
    commeClient(userIdA)

    await expect((await demanderLApercu()).json()).resolves.toEqual({
      etat: "vide",
      connecte: true,
    })
  })

  it("répond les lignes du Panier d'un Client avec les faits que l'Aperçu rend", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 2 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantGrand, quantity: 1 },
    })

    const reponse = await demanderLApercu()

    expect(reponse.status).toBe(200)
    expect(reponse.headers.get("cache-control")).toBe("private, no-store")
    await expect(reponse.json()).resolves.toEqual({
      etat: "plein",
      lignes: [
        {
          productSlug: slugA,
          productName: "Théière Aperçu",
          variantName: "Standard",
          image: "/images/apercu-http-a.jpg",
          quantity: 2,
          unitPrice: 129900,
        },
        {
          productSlug: slugB,
          productName: "Plateau Aperçu",
          variantName: "Grand",
          image: null,
          quantity: 1,
          unitPrice: 95000,
        },
      ],
    })
  })

  it("répond les lignes du Panier d'un Visiteur porteur du cookie, au prix de sa Variante", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantPremium, quantity: 3 }])
    )

    const reponse = await demanderLApercu()

    expect(reponse.headers.get("cache-control")).toBe("private, no-store")
    await expect(reponse.json()).resolves.toEqual({
      etat: "plein",
      lignes: [
        {
          productSlug: slugA,
          productName: "Théière Aperçu",
          variantName: "Premium",
          image: "/images/apercu-http-a.jpg",
          quantity: 3,
          unitPrice: 131400,
        },
      ],
    })
  })

  it("ne laisse un Visiteur lire les lignes d'un Client, ni l'inverse", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantPremium, quantity: 2 }])
    )
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 1 },
    })

    commeVisiteur()
    const panierVisiteur = (await (await demanderLApercu()).json()) as {
      lignes: { variantName: string }[]
    }
    expect(panierVisiteur.lignes.map((ligne) => ligne.variantName)).toEqual([
      "Premium",
    ])

    commeClient(userIdA)
    const panierClient = (await (await demanderLApercu()).json()) as {
      lignes: { variantName: string }[]
    }
    expect(panierClient.lignes.map((ligne) => ligne.variantName)).toEqual([
      "Standard",
    ])
  })

  it("ignore la ligne dont la Variante a disparu, et rend l'état vide si aucune ne survit", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: randomUUID(), quantity: 4 },
        { variantId: variantStandard, quantity: 2 },
      ])
    )

    const avecSurvivante = (await (await demanderLApercu()).json()) as {
      lignes: { productSlug: string; quantity: number }[]
    }
    expect(avecSurvivante.lignes).toEqual([
      {
        productSlug: slugA,
        productName: "Théière Aperçu",
        variantName: "Standard",
        image: "/images/apercu-http-a.jpg",
        quantity: 2,
        unitPrice: 129900,
      },
    ])

    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: randomUUID(), quantity: 4 }])
    )
    await expect((await demanderLApercu()).json()).resolves.toEqual({
      etat: "vide",
      connecte: false,
    })
  })
})
