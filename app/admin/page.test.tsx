import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

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

vi.mock("next/server", () => ({
  connection: async () => {},
}))

vi.mock("@/components/admin/revenue-chart", () => ({
  RevenueChart: () => <span data-testid="graphique-chiffre-affaires" />,
}))

import AdminDashboardPage from "./page"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const prefixe = `dashboard-route-${runId}-`
const URL_IMAGE_SANS_ALT = `https://cdn.example.test/products/${prefixe}sans-alt.webp`
const URL_IMAGE_AVEC_ALT = `https://cdn.example.test/products/${prefixe}avec-alt.webp`
const REGLE_EN_ECHEC = `dashboard-${runId}`

async function creerProduit(cle: string, stocks: number[]) {
  return prisma.product.create({
    data: {
      name: `Produit tableau ${cle} ${runId}`,
      slug: `${prefixe}${cle}`,
      description: "",
      brand: "Test",
      price: 1000,
      specs: {},
      images: [],
      variants: {
        create: stocks.map((stock, index) => ({
          name: `Variante ${index + 1}`,
          sku: `SKU-${prefixe}${cle}-${index}`,
          priceDelta: 0,
          stock,
        })),
      },
    },
  })
}

function lienDontLeTexteEst(
  html: string,
  href: string
): { texte: string } | null {
  const motif = new RegExp(
    `<a[^>]*href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</a>`,
    "g"
  )
  const correspondances = [...html.matchAll(motif)]
  if (correspondances.length === 0) return null
  return {
    texte: correspondances[0]![1]!.replace(/<[^>]*>/g, "").trim(),
  }
}

async function rendreLeTableauDeBord(): Promise<string> {
  const stream = await renderToReadableStream(<AdminDashboardPage />)
  return new Response(stream).text()
}

beforeAll(async () => {
  await creerProduit("en-stock", [3, 2])
  await creerProduit("rupture", [0])
  await creerProduit("sans-variante", [])
  await prisma.imageProduit.createMany({
    data: [
      {
        publicUrl: URL_IMAGE_SANS_ALT,
        mimeType: "image/webp",
        byteSize: 1024,
        width: 800,
        height: 600,
        alt: null,
      },
      {
        publicUrl: URL_IMAGE_AVEC_ALT,
        mimeType: "image/webp",
        byteSize: 1024,
        width: 800,
        height: 600,
        alt: "Déjà décrite",
      },
    ],
  })
  await prisma.automationRule.create({
    data: {
      id: REGLE_EN_ECHEC,
      name: "Règle du tableau de bord",
      trigger: "structure.modifiee",
      condition: { type: "toujours" },
      action: "invalidation.structure",
    },
  })
  await prisma.automationRun.create({
    data: {
      ruleId: REGLE_EN_ECHEC,
      action: "invalidation.structure",
      status: "echoue",
      attempt: 2,
      startedAt: new Date(),
      finishedAt: new Date(),
      lastError: "cache indisponible",
    },
  })
})

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: prefixe } },
  })
  await prisma.imageProduit.deleteMany({
    where: {
      publicUrl: { startsWith: `https://cdn.example.test/products/${prefixe}` },
    },
  })
  await prisma.automationRun.deleteMany({ where: { ruleId: REGLE_EN_ECHEC } })
  await prisma.automationRule.deleteMany({ where: { id: REGLE_EN_ECHEC } })
  await prisma.$disconnect()
})

describe("le Tableau de bord rend ses comptes actionnables", () => {
  it("garde le graphique du chiffre d'affaires", async () => {
    const html = await rendreLeTableauDeBord()

    expect(html).toContain('data-testid="graphique-chiffre-affaires"')
  })

  it("ouvre la Liste des Produits depuis le compte des Produits", async () => {
    const total = await prisma.product.count()
    const html = await rendreLeTableauDeBord()

    expect(lienDontLeTexteEst(html, "/admin/produits")?.texte).toBe(
      String(total)
    )
  })

  it("ouvre la Liste filtrée sur le stock nul depuis le compte des ruptures", async () => {
    const html = await rendreLeTableauDeBord()
    const liensRupture = [
      ...html.matchAll(
        /<a[^>]*href="\/admin\/produits\?stock=zero"[^>]*>([\s\S]*?)<\/a>/g
      ),
    ]

    expect(liensRupture.length).toBeGreaterThan(0)
    expect(liensRupture[0]![1]!.replace(/<[^>]*>/g, "").trim()).toMatch(/^\d+$/)
  })

  it("rend le compte du stock faible et l'ouvre sur sa liste", async () => {
    const html = await rendreLeTableauDeBord()

    expect(html).toContain(">Stock faible<")
    expect(html).toContain('id="stock-faible"')
    expect(lienDontLeTexteEst(html, "#stock-faible")?.texte).toMatch(/^\d+$/)
  })

  it("ouvre la Bibliothèque filtrée sur les Images produit sans Texte alternatif", async () => {
    const sansAlt = await prisma.imageProduit.count({ where: { alt: null } })
    const html = await rendreLeTableauDeBord()

    expect(html).toContain("Images produit sans texte alternatif")
    expect(lienDontLeTexteEst(html, "/admin/medias?sans-alt=1")?.texte).toBe(
      String(sansAlt)
    )
  })

  it("ouvre l'historique filtré sur les automatisations en échec", async () => {
    const enEchec = await prisma.automationRun.count({
      where: { status: "echoue" },
    })
    const html = await rendreLeTableauDeBord()

    expect(html).toContain("Automatisations en échec")
    expect(
      lienDontLeTexteEst(
        html,
        "/admin/automatisations/executions?statut=echoue"
      )?.texte
    ).toBe(String(enEchec))
  })
})
