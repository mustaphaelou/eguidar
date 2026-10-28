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
})

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: prefixe } },
  })
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

  it("ne fabrique pas les comptes qui appartiennent aux phases suivantes", async () => {
    const html = await rendreLeTableauDeBord()

    expect(html).not.toContain("sans texte alternatif")
    expect(html).not.toContain("automatisations en échec")
  })
})
