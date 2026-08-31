import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { sessionUserMock } from "@/test/navigation-mocks"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/get-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getSessionUser: h.sessionUserMock }
})

import { resetCookieStoreMock, setCookie } from "@/test/cookie-store"

import { PanierBadge } from "./panier-badge"
import { prisma } from "@/lib/db"
import {
  NOM_COOKIE_PANIER_VISITEUR,
  serializePanierVisiteur,
} from "@/lib/panier-visiteur"

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

async function renderBadge() {
  const stream = await renderToReadableStream(<PanierBadge />)
  return new Response(stream).text()
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `panier-badge-${runId}-a@test.ma`,
      name: "Utilisateur A",
    },
  })
  userIdA = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `panier-badge-cat-${runId}` },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Badge",
      slug: `panier-badge-prod-${runId}`,
      description: "Description",
      brand: "Marque Badge",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `PBD-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          { name: "Premium", sku: `PBD-${runId}-A2`, priceDelta: 0, stock: 5 },
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
    where: { user: { email: { startsWith: `panier-badge-${runId}-` } } },
  })
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `panier-badge-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `panier-badge-${runId}-` } },
  })
  await prisma.product.deleteMany({
    where: { slug: `panier-badge-prod-${runId}` },
  })
  await prisma.category.deleteMany({
    where: { slug: `panier-badge-cat-${runId}` },
  })
  await prisma.$disconnect()
})

describe("PanierBadge", () => {
  it("renders nothing when a Visiteur holds no article", async () => {
    commeVisiteur()

    expect((await renderBadge()).trim()).toBe("")
  })

  it("counts the Visiteur's Panier as summed quantities, like a Client's", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantA, quantity: 3 },
        { variantId: variantB, quantity: 2 },
      ])
    )

    const html = await renderBadge()

    expect(html).toContain(">5</span>")
    expect(html).not.toContain(">2<")
  })

  it("skips a Visiteur article whose variant vanished, exactly like a Client's Panier", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: "variante-fantome", quantity: 4 },
        { variantId: variantA, quantity: 3 },
      ])
    )

    const html = await renderBadge()

    expect(html).toContain(">3</span>")
    expect(html).not.toContain(">7<")
  })

  it("counts the Client's persisted Panier item count", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantA, quantity: 2 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantB, quantity: 3 },
    })

    const html = await renderBadge()

    expect(html).toContain(">5</span>")
  })

  it("renders nothing when a Client's Panier is empty", async () => {
    commeClient(userIdA)

    expect((await renderBadge()).trim()).toBe("")
  })
})
