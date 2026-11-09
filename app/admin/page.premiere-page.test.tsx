import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll: _scroll,
    ...props
  }: {
    href: string
    children: React.ReactNode
    scroll?: boolean
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const { etat, statsVides } = vi.hoisted(() => {
  const statsVides = () => ({
    productCount: 0,
    outOfStockCount: 0,
    orderCount: 0,
    pendingOrderCount: 0,
    caEncaisse30j: 0,
    caDelta: undefined as number | undefined,
    ordersLast30: 0,
    chiffreAffairesEncaisse: [] as { label: string; montant: number }[],
    lowStockVariants: [] as never[],
    recentOrders: [] as never[],
  })

  return { etat: { stats: statsVides() }, statsVides }
})

vi.mock("@/lib/use-cases/admin-dashboard", () => ({
  getDashboardStats: async () => etat.stats,
}))

vi.mock("@/lib/use-cases/images-produit", () => ({
  listerImagesProduit: async () => ({
    images: [],
    totalCount: 0,
    inutiliseesCount: 0,
    sansAltCount: 0,
  }),
}))

vi.mock("@/lib/automations/historique", () => ({
  compterExecutionsEnEchec: async () => 0,
}))

vi.mock("@/components/admin/graphique-chiffre-affaires", () => ({
  GraphiqueDuChiffreAffaires: () => (
    <span data-testid="graphique-chiffre-affaires" />
  ),
}))

import AdminDashboardPage from "./page"

async function rendre(): Promise<string> {
  const stream = await renderToReadableStream(
    <AdminDashboardPage searchParams={Promise.resolve({})} />
  )
  return new Response(stream).text()
}

beforeEach(() => {
  etat.stats = statsVides()
})

describe("la première page du Tableau de bord", () => {
  it("n'invite qu'à créer le premier produit quand le catalogue et les Commandes sont vides", async () => {
    const html = await rendre()

    expect(html).toContain("Aucun Produit au catalogue.")
    expect(html).toContain(
      "Un Produit, une Variante et son stock suffisent à la première Commande."
    )
    expect(html).toContain("Créer le premier produit")
    expect(html).toContain('href="/admin/produits/nouveau"')
    expect(html).toContain("Voir la boutique")
    expect(html).toContain('href="/"')
    expect(html).toContain("La boutique est en ligne ; son catalogue est vide.")
  })

  it("ne rend aucun indicateur, aucun graphique, aucune période et aucune liste", async () => {
    const html = await rendre()

    expect(html).not.toContain("Commandes récentes")
    expect(html).not.toContain("À surveiller")
    expect(html).not.toContain("30 j")
    expect(html).not.toContain("Indicateurs principaux")
    expect(html).not.toContain('data-testid="graphique-chiffre-affaires"')
  })

  it("rend le Tableau de bord de travail dès qu'un Produit existe", async () => {
    etat.stats.productCount = 1

    const html = await rendre()

    expect(html).not.toContain("Aucun Produit au catalogue.")
    expect(html).toMatch(/Chiffre d(?:&#x27;|')affaires encaissé/)
    expect(html).toContain("Commandes récentes")
    expect(html).toContain("À surveiller")
    expect(html).toContain('data-testid="graphique-chiffre-affaires"')
  })

  it("garde le Tableau de bord de travail quand un catalogue vide a une histoire de Commandes", async () => {
    etat.stats.orderCount = 3

    const html = await rendre()

    expect(html).not.toContain("Aucun Produit au catalogue.")
    expect(html).toContain("Commandes récentes")
  })
})
