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

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))

vi.mock("next/cache", () => ({ refresh: refreshMock }))

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

import { resetCookieStoreMock, setCookie } from "@/test/cookie-store"

import { ApercuPanier } from "./apercu-panier"
import { ApercuDuPanierProvider } from "./apercu-du-panier-provider"
import { PanierBadge } from "./panier-badge"
import { prisma } from "@/lib/db"

const NOM_COOKIE_PANIER_VISITEUR = "panier-visiteur"
const serializePanierVisiteur = (
  articles: readonly { variantId: string; quantity: number }[]
) => JSON.stringify(articles)

const runId = randomUUID().slice(0, 8)

let userIdA: string
let variantStandard: string
let variantPremium: string

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

async function renderApercu() {
  const stream = await renderToReadableStream(
    <ApercuDuPanierProvider>
      <ApercuPanier />
    </ApercuDuPanierProvider>
  )
  return new Response(stream).text()
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `apercu-panier-${runId}-a@test.ma`,
      name: "Utilisateur A",
    },
  })
  userIdA = user.id

  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `apercu-panier-cat-${runId}` },
  })
  const product = await prisma.product.create({
    data: {
      name: "Produit Aperçu",
      slug: `apercu-panier-prod-${runId}`,
      description: "Description",
      brand: "Marque Aperçu",
      categoryId: category.id,
      price: 129900,
      specs: {},
      images: ["/images/produit-apercu.jpg"],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `APR-${runId}-A1`,
            priceDelta: 0,
            stock: 10,
          },
          {
            name: "Premium",
            sku: `APR-${runId}-A2`,
            priceDelta: 0,
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
  refreshMock.mockClear()
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `apercu-panier-${runId}-` } } },
  })
})

afterAll(async () => {
  await prisma.cartItem.deleteMany({
    where: { user: { email: { startsWith: `apercu-panier-${runId}-` } } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `apercu-panier-${runId}-` } },
  })
  await prisma.product.deleteMany({
    where: { slug: `apercu-panier-prod-${runId}` },
  })
  await prisma.category.deleteMany({
    where: { slug: `apercu-panier-cat-${runId}` },
  })
  await prisma.$disconnect()
})

describe("ApercuPanier", () => {
  it("rend un état vide de Visiteur avec l'invitation à se connecter", async () => {
    commeVisiteur()

    const html = await renderApercu()

    expect(html).toContain(">Votre panier est vide</h2>")
    expect(html).toContain('id="apercu-du-panier-titre"')
    expect(html).toContain(
      "Connectez-vous pour retrouver le panier de votre compte."
    )
    expect(html).not.toContain("Découvrir les produits")
    expect(html).not.toContain('href="/"')
  })

  it("rend un état vide de Client sans invitation à se connecter", async () => {
    commeClient(userIdA)

    const html = await renderApercu()

    expect(html).toContain("Votre panier est vide")
    expect(html).not.toContain(
      "Connectez-vous pour retrouver le panier de votre compte."
    )
    expect(html).not.toContain("Découvrir les produits")
    expect(html).not.toContain('href="/"')
  })

  it("rend une ligne par Article du panier avec vignette, produit lié et variante", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 1 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantPremium, quantity: 2 },
    })

    const html = await renderApercu()

    expect(html).toContain(">Mon panier</h2>")
    expect(html).toContain('id="apercu-du-panier-titre"')
    expect(html).not.toContain("Votre panier est vide")
    expect(html).toContain(`href="/produit/apercu-panier-prod-${runId}"`)
    expect(html).toContain("Produit Aperçu")
    expect(html).toContain("Standard")
    expect(html).toContain("Premium")
    expect(html).toContain("produit-apercu.jpg")
    expect(html).toContain('alt="Produit Aperçu"')
  })

  it("rend les lignes d’un Panier de Visiteur, sans invitation à se connecter", async () => {
    commeVisiteur()
    setCookie(
      NOM_COOKIE_PANIER_VISITEUR,
      serializePanierVisiteur([{ variantId: variantStandard, quantity: 2 }])
    )

    const html = await renderApercu()

    expect(html).toContain("Mon panier")
    expect(html).toContain("Produit Aperçu")
    expect(html).toContain("Standard")
    expect(html).toContain("2 × 1.299,00\u00A0MAD")
    expect(html).not.toContain(
      "Connectez-vous pour retrouver le panier de votre compte."
    )
  })

  it("affiche « N × prix » seulement au-dessus d'une unité", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 1 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantPremium, quantity: 2 },
    })

    const html = await renderApercu()

    expect(html).toContain("2 × 1.299,00\u00A0MAD")
    expect(html).not.toContain("1 ×")
    expect(html.match(/1\.299,00/g)).toHaveLength(1)
  })

  it("n'offre qu'un seul « Voir le panier », vers la Page du Panier", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 2 },
    })

    const html = await renderApercu()

    expect(html.match(/Voir le panier/g)).toHaveLength(1)
    expect(html).toContain('href="/panier"')
  })

  it("ne porte ni stepper, ni retrait, ni total de ligne, sous-total, Livraison ou Total à payer", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 2 },
    })

    const html = await renderApercu()

    expect(html).not.toContain("Diminuer la quantité")
    expect(html).not.toContain("Augmenter la quantité")
    expect(html).not.toContain("Retirer du panier")
    expect(html).not.toContain("Sous-total")
    expect(html).not.toContain("Livraison")
    expect(html).not.toContain("Total à payer")
    expect(html).not.toContain("2.598,00")
  })

  it("compte dans le badge les quantités que le corps montre, pour le même Panier", async () => {
    commeClient(userIdA)
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantStandard, quantity: 2 },
    })
    await prisma.cartItem.create({
      data: { userId: userIdA, variantId: variantPremium, quantity: 3 },
    })

    const badgeHtml = await new Response(
      await renderToReadableStream(<PanierBadge />)
    ).text()
    const corpsHtml = await renderApercu()

    expect(badgeHtml).toContain(">5</span>")
    expect(corpsHtml).toContain("2 × 1.299,00\u00A0MAD")
    expect(corpsHtml).toContain("3 × 1.299,00\u00A0MAD")
  })
})
