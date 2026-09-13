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
import { ajouterArticleAuPanier } from "@/lib/panier"
import {
  deletedCookieNames,
  hasCookie,
  resetCookieStoreMock,
  setCookie,
} from "@/test/cookie-store"
import { sessionUserMock } from "@/test/navigation-mocks"

const { handlerMock, getSessionMock } = vi.hoisted(() => ({
  handlerMock: vi.fn(),
  getSessionMock: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    handler: handlerMock,
    api: { getSession: getSessionMock },
  },
}))

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/get-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getSessionUser: h.sessionUserMock }
})

import { GET, POST } from "./route"

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"

type ArticlePanierVisiteur = { variantId: string; quantity: number }

const serializePanierVisiteur = (
  articles: readonly ArticlePanierVisiteur[]
) => JSON.stringify(articles)

const runId = randomUUID().slice(0, 8)
const email = (suffix: string) => `replay-${runId}-${suffix}@test.ma`

let userId: string
let variantA: string
let variantB: string
const varianteSupprimee = randomUUID()

function requete(
  methode: string,
  chemin: string,
  panier?: ArticlePanierVisiteur[]
): Request {
  const entetes = new Headers()
  if (panier) {
    const valeur = serializePanierVisiteur(panier)
    setCookie(NOM_COOKIE_PANIER_VISITEUR, valeur)
    entetes.set("cookie", `${NOM_COOKIE_PANIER_VISITEUR}=${valeur}`)
  }
  return new Request(`http://localhost:3000${chemin}`, {
    method: methode,
    headers: entetes,
  })
}

function connexionMotDePasse(panier?: ArticlePanierVisiteur[]): Request {
  return requete("POST", "/api/auth/sign-in/email", panier)
}

function callbackFournisseur(
  fournisseur: string,
  panier?: ArticlePanierVisiteur[]
): Request {
  return requete(
    "GET",
    `/api/auth/callback/${fournisseur}?code=x&state=y`,
    panier
  )
}

function reponseAuth(status: number, avecSession = true): Response {
  return new Response(null, {
    status,
    headers: avecSession
      ? {
          location: "/",
          "set-cookie":
            "better-auth.session_token=jeton-frais; Path=/; HttpOnly; SameSite=Lax",
        }
      : {},
  })
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
    data: { id: randomUUID(), email: email("a"), name: "Utilisateur Replay" },
  })
  userId = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `replay-cat-${runId}` },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Replay",
      slug: `replay-prod-${runId}`,
      description: "Description",
      brand: "Marque Replay",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `REPLAY-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `REPLAY-${runId}-A2`,
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
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `replay-${runId}-` } } },
  })
  resetCookieStoreMock()
  handlerMock.mockReset()
  getSessionMock.mockReset()
  getSessionMock.mockResolvedValue({ user: { id: userId } })
  sessionUserMock.mockReset()
  sessionUserMock.mockResolvedValue({ id: userId })
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `replay-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `replay-${runId}-` } },
  })
  await prisma.product.deleteMany({ where: { slug: `replay-prod-${runId}` } })
  await prisma.category.deleteMany({ where: { slug: `replay-cat-${runId}` } })
  await prisma.$disconnect()
})

describe("auth route replaying the Visiteur's cookie Panier", () => {
  it("sums the cookie articles into the persisted Panier after a password sign-in and deletes the cookie", async () => {
    await ajouterArticleAuPanier(variantA, 3)
    const requeteConnexion = connexionMotDePasse([
      { variantId: variantA, quantity: 2 },
      { variantId: variantB, quantity: 1 },
      { variantId: varianteSupprimee, quantity: 5 },
    ])
    const reponseConnexion = reponseAuth(200)
    handlerMock.mockResolvedValue(reponseConnexion)

    const reponse = await POST(requeteConnexion)

    expect(await lignesPanier()).toEqual([
      { variantId: variantA, quantity: 5 },
      { variantId: variantB, quantity: 1 },
    ])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
    expect(deletedCookieNames).toEqual([NOM_COOKIE_PANIER_VISITEUR])
    expect(reponse).toBe(reponseConnexion)
    const entetes = getSessionMock.mock.calls[0][0].headers as Headers
    const cookie = entetes.get("cookie") ?? ""
    expect(cookie).toContain("better-auth.session_token=jeton-frais")
    expect(cookie).toContain(`${NOM_COOKIE_PANIER_VISITEUR}=`)
  })

  it.each(["google", "facebook"])(
    "lands the same merged Panier through the same helper after a %s social callback",
    async (fournisseur) => {
      await ajouterArticleAuPanier(variantA, 3)
      const reponseCallback = reponseAuth(302)
      handlerMock.mockResolvedValue(reponseCallback)

      const reponse = await GET(
        callbackFournisseur(fournisseur, [
          { variantId: variantA, quantity: 2 },
          { variantId: varianteSupprimee, quantity: 5 },
        ])
      )

      expect(await lignesPanier()).toEqual([
        { variantId: variantA, quantity: 5 },
      ])
      expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
      expect(deletedCookieNames).toEqual([NOM_COOKIE_PANIER_VISITEUR])
      expect(reponse).toBe(reponseCallback)
    }
  )

  it("keeps the cookie Panier untouched when authentication fails", async () => {
    getSessionMock.mockResolvedValue(null)
    handlerMock.mockResolvedValue(reponseAuth(401, false))

    await POST(connexionMotDePasse([{ variantId: variantA, quantity: 2 }]))

    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(true)
    expect(deletedCookieNames).toEqual([])
    expect(await lignesPanier()).toEqual([])
  })

  it("replays nothing when no Visiteur cookie is present", async () => {
    handlerMock.mockResolvedValue(reponseAuth(200))
    const requeteSansPanier = requete("POST", "/api/auth/sign-in/email")

    await POST(requeteSansPanier)

    expect(getSessionMock).toHaveBeenCalled()
    expect(deletedCookieNames).toEqual([])
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(false)
    expect(await lignesPanier()).toEqual([])
  })

  it("does not attempt a replay on other auth endpoints like get-session polling", async () => {
    handlerMock.mockResolvedValue(new Response(null, { status: 200 }))
    const requetePolling = requete("GET", "/api/auth/get-session", [
      { variantId: variantA, quantity: 2 },
    ])

    await GET(requetePolling)

    expect(getSessionMock).not.toHaveBeenCalled()
    expect(hasCookie(NOM_COOKIE_PANIER_VISITEUR)).toBe(true)
    expect(await lignesPanier()).toEqual([])
  })

  it("propagates a failing auth handler unchanged", async () => {
    handlerMock.mockRejectedValue(new Error("boom"))

    await expect(
      POST(connexionMotDePasse([{ variantId: variantA, quantity: 2 }]))
    ).rejects.toThrow("boom")
  })
})
