import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

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

vi.mock("@/components/admin/graphique-chiffre-affaires", () => ({
  GraphiqueDuChiffreAffaires: ({ data }: { data: unknown[] }) => (
    <span data-testid="graphique-chiffre-affaires" data-points={data.length} />
  ),
}))

import AdminDashboardPage from "./page"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const prefixe = `dashboard-route-${runId}-`
const URL_IMAGE_SANS_ALT = `https://cdn.example.test/products/${prefixe}sans-alt.webp`
const URL_IMAGE_AVEC_ALT = `https://cdn.example.test/products/${prefixe}avec-alt.webp`
const REGLE_EN_ECHEC = `dashboard-${runId}`
const COURRIEL_CLIENT = `dashboard-route-${runId}@test.ma`

let produitEnStockId: string
let produitRuptureId: string
let produitSansVarianteId: string
let userId: string

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

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function liensVers(
  html: string,
  href: string
): { balise: string; texte: string }[] {
  const motif = new RegExp(
    `<a[^>]*href="${echapper(href)}"[^>]*>([\\s\\S]*?)</a>`,
    "g"
  )
  return [...html.matchAll(motif)].map((correspondance) => ({
    balise: correspondance[0]!.slice(0, correspondance[0]!.indexOf(">") + 1),
    texte: correspondance[1]!.replace(/<[^>]*>/g, "").trim(),
  }))
}

function lienDontLeTexteEst(
  html: string,
  href: string
): { texte: string } | null {
  return liensVers(html, href)[0] ?? null
}

async function rendreLeTableauDeBord(
  params: Record<string, string | string[]> = {}
): Promise<string> {
  const stream = await renderToReadableStream(
    <AdminDashboardPage searchParams={Promise.resolve(params)} />
  )
  return new Response(stream).text()
}

beforeAll(async () => {
  produitEnStockId = (await creerProduit("en-stock", [3, 2])).id
  produitRuptureId = (await creerProduit("rupture", [0])).id
  produitSansVarianteId = (await creerProduit("sans-variante", [])).id

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

  userId = (
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: COURRIEL_CLIENT,
        name: "Client du tableau de bord",
      },
    })
  ).id

  await prisma.order.create({
    data: {
      userId,
      cityName: "Casablanca",
      address: "1 Rue du Test",
      phone: "+212600000000",
      total: 2400,
      shippingFee: 600,
      totalPayable: 3000,
      status: "delivered",
    },
  })
})

afterAll(async () => {
  await prisma.order.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { email: COURRIEL_CLIENT } })
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
  it("garde le graphique et lui donne les trente jours du défaut", async () => {
    const html = await rendreLeTableauDeBord()

    expect(html).toContain('data-testid="graphique-chiffre-affaires"')
    expect(html).toContain('data-points="30"')
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
    const liensRupture = liensVers(html, "/admin/produits?stock=zero")

    expect(liensRupture.length).toBeGreaterThan(0)
    expect(liensRupture[0]!.texte).toMatch(/^\d+$/)
  })

  it("ne répète plus l'alerte Stock faible mais garde l'ancre et ses lignes", async () => {
    const html = await rendreLeTableauDeBord()

    expect(lienDontLeTexteEst(html, "#stock-faible")).toBeNull()
    expect(html).toContain('id="stock-faible"')

    const ligneEnStock = liensVers(html, `/admin/produits/${produitEnStockId}`)
    expect(ligneEnStock.length).toBeGreaterThan(0)
    expect(ligneEnStock[0]!.texte).toContain(
      `Produit tableau en-stock ${runId}`
    )

    const ligneRupture = liensVers(html, `/admin/produits/${produitRuptureId}`)
    expect(ligneRupture.length).toBeGreaterThan(0)
    expect(ligneRupture[0]!.texte).toContain(`Produit tableau rupture ${runId}`)

    expect(html).not.toContain(`/admin/produits/${produitSansVarianteId}`)
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

  it("nomme le total des Commandes dans le pied de la liste", async () => {
    const total = await prisma.order.count()
    const html = await rendreLeTableauDeBord()
    const pied = liensVers(html, "/admin/commandes").at(-1)

    expect(pied?.texte).toBe(
      total > 1 ? `Voir les ${total} commandes` : "Voir la commande"
    )
  })

  it("rend la période comme trois liens serveur, le défaut actif", async () => {
    const html = await rendreLeTableauDeBord()

    const defaut = liensVers(html, "/admin")[0]!
    expect(defaut.texte).toBe("30 j")
    expect(defaut.balise).toContain('aria-current="page"')
    expect(defaut.balise).toContain('aria-label="30 derniers jours"')

    const quatreVingtDix = liensVers(html, "/admin?periode=90j")[0]!
    expect(quatreVingtDix.texte).toBe("90 j")
    expect(quatreVingtDix.balise).not.toContain("aria-current")
    expect(quatreVingtDix.balise).toContain('aria-label="90 derniers jours"')

    const douzeMois = liensVers(html, "/admin?periode=12mois")[0]!
    expect(douzeMois.texte).toBe("12 mois")
    expect(douzeMois.balise).not.toContain("aria-current")
    expect(douzeMois.balise).toContain('aria-label="12 derniers mois"')
  })

  it("suit la période demandée jusqu'aux seaux du graphique", async () => {
    const html90 = await rendreLeTableauDeBord({ periode: "90j" })

    expect(html90).toContain('data-points="13"')
    expect(liensVers(html90, "/admin?periode=90j")[0]!.balise).toContain(
      'aria-current="page"'
    )
    expect(liensVers(html90, "/admin")[0]!.balise).not.toContain("aria-current")

    const html12 = await rendreLeTableauDeBord({ periode: "12mois" })
    expect(html12).toContain('data-points="12"')
    expect(liensVers(html12, "/admin?periode=12mois")[0]!.balise).toContain(
      'aria-current="page"'
    )
  })
})
