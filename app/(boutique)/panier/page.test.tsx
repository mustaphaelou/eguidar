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

import { sessionCouranteMock } from "@/test/navigation-mocks"

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/session-courante", async () => {
  const h = await import("@/test/navigation-mocks")
  return { lireSession: h.sessionCouranteMock }
})

const { profileMock } = vi.hoisted(() => ({ profileMock: vi.fn() }))

vi.mock("@/lib/use-cases/account", () => ({
  getProfile: profileMock,
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/storefront/city-picker", () => ({
  CityPicker: ({ selectedId }: { selectedId: string | null }) => (
    <div data-testid="city-picker-stub" data-selected={selectedId ?? ""} />
  ),
}))

import { resetCookieStoreMock, setCookie } from "@/test/cookie-store"

import CartPage from "./page"
import { prisma } from "@/lib/db"
import { formatPrice } from "@/lib/money"

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"
const serializePanierVisiteur = (
  articles: readonly { variantId: string; quantity: number }[]
) => JSON.stringify(articles)

const runId = randomUUID().slice(0, 8)

let userIdA: string
let variantStandard: string
let variantUnique: string
let cityId: string
let citySlug: string

function commeClient(userId: string) {
  sessionCouranteMock.mockResolvedValue({
    id: userId,
    name: "Client Test",
    email: "client@example.ma",
    role: "user",
  })
}

function commeVisiteur() {
  sessionCouranteMock.mockResolvedValue(null)
}

async function renderPage(searchParams: { ville?: string } = {}) {
  const stream = await renderToReadableStream(
    <CartPage searchParams={Promise.resolve(searchParams)} />
  )
  return new Response(stream).text()
}

beforeAll(async () => {
  await prisma.shippingSettings.upsert({
    where: { id: "default" },
    create: { id: "default", freeShippingThreshold: 10000000 },
    update: { freeShippingThreshold: 10000000 },
  })

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `panier-page-${runId}-a@test.ma`,
      name: "Utilisateur A",
    },
  })
  userIdA = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `panier-page-cat-${runId}` },
  })
  const productA = await prisma.product.create({
    data: {
      name: "Théière traditionnelle",
      slug: `panier-page-prod-a-${runId}`,
      description: "Description A",
      brand: "Marque A",
      categoryId: category.id,
      price: 100000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `PGE-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
        ],
      },
    },
    include: { variants: true },
  })
  const productB = await prisma.product.create({
    data: {
      name: "Plateau en cuivre",
      slug: `panier-page-prod-b-${runId}`,
      description: "Description B",
      brand: "Marque B",
      categoryId: category.id,
      price: 50000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          { name: "Unique", sku: `PGE-${runId}-B1`, priceDelta: 0, stock: 5 },
        ],
      },
    },
    include: { variants: true },
  })
  variantStandard = productA.variants[0].id
  variantUnique = productB.variants[0].id

  const city = await prisma.deliveryCity.create({
    data: { name: `Ville ${runId}`, slug: `ville-${runId}`, fee: 3000 },
  })
  cityId = city.id
  citySlug = city.slug
})

beforeEach(async () => {
  resetCookieStoreMock()
  sessionCouranteMock.mockReset()
  profileMock.mockReset()
  profileMock.mockResolvedValue({
    phone: null,
    address: null,
    cityId: null,
    cityName: null,
  })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `panier-page-${runId}-` } } },
  })
})

afterAll(async () => {
  await prisma.shippingSettings.deleteMany({ where: { id: "default" } })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `panier-page-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `panier-page-${runId}-` } },
  })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `panier-page-prod-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: `panier-page-cat-${runId}` },
  })
  await prisma.deliveryCity.deleteMany({ where: { name: `Ville ${runId}` } })
  await prisma.$disconnect()
})

describe("CartPage — Visiteur (cookie Panier)", () => {
  it("renders the cookie Panier fully — no placeholder, no forced modal", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantUnique, quantity: 1 },
      ])
    )

    const html = await renderPage()

    expect(html).toContain("Mon panier")
    expect(html).toContain("Théière traditionnelle")
    expect(html).toContain("Plateau en cuivre")
    expect(html).toContain(">2</span>")
    expect(html).toContain(">1</span>")
    expect(html).not.toContain("Connectez-vous pour continuer")
    expect(html).not.toContain("Cette page est réservée")
  })

  it("computes prices and totals from database variant prices, like a Client's view", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantUnique, quantity: 1 },
      ])
    )

    const html = await renderPage({ ville: cityId })

    expect(html).toContain(formatPrice(100000))
    expect(html).toContain(formatPrice(50000))
    expect(html).toContain(formatPrice(200000))
    expect(html).toContain(formatPrice(250000))
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain(formatPrice(253000))
    expect(html).toContain("MAD")
  })

  it("shows the empty state when the cookie holds no article", async () => {
    commeVisiteur()

    const html = await renderPage()

    expect(html).toContain("Votre panier est vide")
    expect(html).not.toContain("Récapitulatif")
  })

  it("skips stale articles instead of failing the render", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: "variante-fantome", quantity: 4 },
        { variantId: variantUnique, quantity: 1 },
      ])
    )

    const html = await renderPage()

    expect(html).toContain("Plateau en cuivre")
    expect(html).not.toContain("variante-fantome")
  })

  it("keeps pointing Passer commande at the client-gated /checkout", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantStandard, quantity: 1 }])
    )

    const html = await renderPage({ ville: cityId })

    expect(html).toContain(`href="/checkout?ville=${citySlug}"`)
    expect(html).not.toContain(`href="/checkout?ville=${cityId}"`)
    expect(html).toContain("Passer commande")
  })
})

describe("CartPage — Récapitulatif Ville de livraison", () => {
  it("names the Ville de livraison with its fees and total when a ville is chosen", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantUnique, quantity: 1 },
      ])
    )

    const html = await renderPage({ ville: cityId })

    expect(html).toContain(`Livraison (Ville ${runId})`)
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain(formatPrice(253000))
    expect(html).toContain(`data-selected="${cityId}"`)
    expect(html).toContain(`href="/checkout?ville=${citySlug}"`)
  })

  it("selects the Ville de livraison from its slug in the URL", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantUnique, quantity: 1 },
      ])
    )

    const html = await renderPage({ ville: `ville-${runId}` })

    expect(html).toContain(`Livraison (Ville ${runId})`)
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain(formatPrice(253000))
    expect(html).toContain(`data-selected="${cityId}"`)
    expect(html).toContain(`href="/checkout?ville=${citySlug}"`)
  })

  it("still resolves a legacy internal identifier as a read-only alias", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantStandard, quantity: 1 }])
    )

    const html = await renderPage({ ville: cityId })

    expect(html).toContain(`Livraison (Ville ${runId})`)
    expect(html).toContain(`data-selected="${cityId}"`)
  })

  it("leaves no selection for an unknown slug", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantStandard, quantity: 1 }])
    )

    const html = await renderPage({ ville: `ville-inconnue-${runId}` })

    expect(html).toContain("À choisir")
    expect(html).not.toContain("Livraison (")
    expect(html).toContain('data-selected=""')
    expect(html).not.toContain("?ville=")
  })

  it("shows « À choisir » without total when no ville is chosen", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([
        { variantId: variantStandard, quantity: 2 },
        { variantId: variantUnique, quantity: 1 },
      ])
    )

    const html = await renderPage()

    expect(html).toContain("À choisir")
    expect(html).toContain(formatPrice(250000))
    expect(html).not.toContain(formatPrice(253000))
    expect(html).not.toContain("Livraison offerte d")
    expect(html).toContain('data-selected=""')
    expect(html).not.toContain("?ville=")
  })

  it("falls back to « Livraison » without crashing on a stale ville param", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantStandard, quantity: 1 }])
    )

    const html = await renderPage({ ville: "ville-perimee" })

    expect(html).toContain("Mon panier")
    expect(html).toContain("À choisir")
    expect(html).not.toContain("Livraison (")
    expect(html).not.toContain("Livraison offerte d")
    expect(html).toContain('data-selected=""')
    expect(html).toContain('href="/checkout"')
    expect(html).not.toContain("?ville=")
    expect(html).not.toContain(formatPrice(103000))
  })
})

describe("CartPage — Compte client (persisted Panier)", () => {
  it("renders the persisted Panier unchanged through the same view", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 2 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantUnique, quantity: 1 },
    })

    const html = await renderPage({ ville: cityId })

    expect(html).toContain("Mon panier")
    expect(html).toContain("Théière traditionnelle")
    expect(html).toContain("Plateau en cuivre")
    expect(html).toContain(formatPrice(250000))
    expect(html).toContain(formatPrice(253000))
    expect(html).not.toContain("Connectez-vous pour continuer")
    expect(html).toContain("Passer commande")
  })

  it("shows the same empty state when no persisted article exists", async () => {
    commeClient(userIdA)

    const html = await renderPage()

    expect(html).toContain("Votre panier est vide")
  })

  it("falls back to the profile's saved Ville when the URL names none", async () => {
    commeClient(userIdA)
    profileMock.mockResolvedValue({
      phone: null,
      address: null,
      cityId,
      cityName: `Ville ${runId}`,
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 2 },
    })

    const html = await renderPage()

    expect(html).toContain(`Livraison (Ville ${runId})`)
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain(formatPrice(203000))
    expect(html).toContain(`data-selected="${cityId}"`)
    expect(html).toContain(`href="/checkout?ville=${citySlug}"`)
  })

  it("never falls back to the profile behind an explicitly shared unknown Ville", async () => {
    commeClient(userIdA)
    profileMock.mockResolvedValue({
      phone: null,
      address: null,
      cityId,
      cityName: `Ville ${runId}`,
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 1 },
    })

    const html = await renderPage({ ville: `ville-inconnue-${runId}` })

    expect(html).toContain("À choisir")
    expect(html).not.toContain("Livraison (")
    expect(html).toContain('data-selected=""')
    expect(html).not.toContain("?ville=")
  })
})
