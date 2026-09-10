/**
 * Page Commander (checkout) — test de rendu, façonné comme le test de la
 * page Panier : fixtures réelles en base, session et profil moqués, rendu
 * via `renderToReadableStream`, assertions sur le HTML.
 *
 * Limite honnête : vitest ignore « use client » — ce test prouve le rendu
 * de la page, pas la sérialisation RSC ; le verrou de sérialisation est le
 * test de frontière données pures sur `chargerDevis`
 * (`lib/use-cases/devis.test.ts`) plus le type de prop `DevisChargé` de
 * `CheckoutForm`.
 */
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

import { redirectMock, sessionUserMock } from "@/test/navigation-mocks"

vi.mock("next/navigation", async () => {
  const h = await import("@/test/navigation-mocks")
  return { redirect: h.redirectMock }
})

vi.mock("next/headers", async () => {
  const h = await import("@/test/cookie-store")
  return { cookies: async () => h.cookieStoreMock }
})

vi.mock("@/lib/use-cases/get-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getSessionUser: h.sessionUserMock }
})

const { profileMock } = vi.hoisted(() => ({ profileMock: vi.fn() }))

vi.mock("@/lib/use-cases/account", () => ({
  getProfile: profileMock,
}))

vi.mock("@/components/auth/require-auth", () => ({
  RequireAuth: () => <div data-testid="require-auth-stub" />,
}))

vi.mock("@/components/auth/use-unauthenticated-refusal", () => ({
  useUnauthenticatedRefusal: () => undefined,
}))

vi.mock("@/app/(boutique)/checkout/actions", () => ({
  placeOrderAction: vi.fn(),
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    name,
    required,
  }: {
    children?: React.ReactNode
    value?: string
    name?: string
    required?: boolean
  }) => (
    <div
      data-slot="select-stub"
      data-value={value ?? ""}
      data-required={required ? "true" : "false"}
    >
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}))

import { resetCookieStoreMock } from "@/test/cookie-store"

import CheckoutPage from "./page"
import { prisma } from "@/lib/db"
import { formatPrice } from "@/lib/money"

const runId = randomUUID().slice(0, 8)

let userIdA: string
let variantStandard: string
let variantUnique: string
let cityId: string

function commeClient(userId: string) {
  sessionUserMock.mockResolvedValue({ id: userId })
}

function profilClient() {
  return {
    phone: "+212600000000",
    address: "12 rue des Orangers",
    cityId,
    cityName: `Ville ${runId}`,
  }
}

async function renderPage(searchParams: { ville?: string } = {}) {
  const stream = await renderToReadableStream(
    <CheckoutPage searchParams={Promise.resolve(searchParams)} />
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
      email: `checkout-page-${runId}-a@test.ma`,
      name: "Utilisateur A",
    },
  })
  userIdA = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `checkout-page-cat-${runId}` },
  })
  const productA = await prisma.product.create({
    data: {
      name: "Théière traditionnelle",
      slug: `checkout-page-prod-a-${runId}`,
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
      slug: `checkout-page-prod-b-${runId}`,
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
})

beforeEach(async () => {
  resetCookieStoreMock()
  sessionUserMock.mockReset()
  profileMock.mockReset()
  profileMock.mockResolvedValue(profilClient())
  redirectMock.mockClear()
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `checkout-page-${runId}-` } } },
  })
})

afterAll(async () => {
  await prisma.shippingSettings.deleteMany({ where: { id: "default" } })
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `checkout-page-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `checkout-page-${runId}-` } },
  })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `checkout-page-prod-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: `checkout-page-cat-${runId}` },
  })
  await prisma.deliveryCity.deleteMany({ where: { name: `Ville ${runId}` } })
  await prisma.$disconnect()
})

describe("CheckoutPage — Compte client (persisted Panier)", () => {
  it("renders the city selector and the Récapitulatif de paiement for a Client with a persisted Panier", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 2 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantUnique, quantity: 1 },
    })

    const html = await renderPage({ ville: cityId })

    expect(html).toContain("Commander")
    expect(html).toContain("Théière traditionnelle")
    expect(html).toContain("Plateau en cuivre")
    expect(html).toContain("Ville de livraison")
    expect(html).toContain(`data-value="${cityId}"`)
    expect(html).toContain(`Livraison (Ville ${runId})`)
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain(formatPrice(250000))
    expect(html).toContain(formatPrice(253000))
    expect(html).toContain("Total à payer à la livraison")
    expect(html).toContain("Paiement à la livraison")
    expect(html).toContain("Confirmer la commande")
  })

  it("falls back to « À choisir » without total on a stale ville param", async () => {
    commeClient(userIdA)
    profileMock.mockResolvedValue({
      phone: null,
      address: null,
      cityId: null,
      cityName: null,
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 1 },
    })

    const html = await renderPage({ ville: "ville-perimee" })

    expect(html).toContain("Commander")
    expect(html).toContain("À choisir")
    expect(html).toContain('data-value=""')
    expect(html).not.toContain("Livraison (")
    expect(html).not.toContain("Total à payer à la livraison")
    expect(html).not.toContain(formatPrice(103000))
  })

  it("preselects the profile's Ville and prefills address and phone when no ville param is present", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 1 },
    })

    const html = await renderPage()

    expect(html).toContain("Commander")
    expect(html).toContain(`data-value="${cityId}"`)
    expect(html).toContain(`Livraison (Ville ${runId})`)
    expect(html).toContain(formatPrice(100000))
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain(formatPrice(103000))
    expect(html).toContain("12 rue des Orangers")
    expect(html).toContain("+212600000000")
  })

  it("redirects an empty Panier to /panier instead of rendering the Commander page", async () => {
    commeClient(userIdA)

    try {
      await renderPage()
    } catch {
      // Expected: the redirect sentinel aborts the render
    }

    expect(redirectMock).toHaveBeenCalledWith("/panier")
  })
})
