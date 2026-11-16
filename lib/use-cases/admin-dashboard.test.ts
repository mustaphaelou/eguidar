import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  cleDuSeau,
  libelleDuSeau,
  seauxDePeriode,
} from "@/lib/tableau-de-bord-periode"
import {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"

const runId = randomUUID().slice(0, 8)
const DAY_MS = 86_400_000

type SeedStatus =
  "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned"

let userIdA: string
let produitStockFaibleId: string

async function createUser(suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `dashboard-${runId}-${suffix}@test.ma`,
      name: `Utilisateur dashboard ${suffix}`,
    },
  })
  return user.id
}

async function createSeedOrder(
  status: SeedStatus,
  ageDays: number,
  total = 1000,
  shippingFee = 0
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId: userIdA,
      cityName: "Casablanca",
      address: "1 Rue du Test",
      phone: "+212600000000",
      total,
      shippingFee,
      totalPayable: total + shippingFee,
      status,
      createdAt: new Date(Date.now() - ageDays * DAY_MS),
    },
  })
  return order.id
}

function createPaiementAt(
  orderId: string,
  amount: number,
  collectedAt: Date
): Promise<{ id: string; collectedAt: Date }> {
  return prisma.payment.create({
    data: {
      orderId,
      amount,
      mode: "cash_on_delivery",
      collectedAt,
    },
    select: { id: true, collectedAt: true },
  })
}

function createPaiement(
  orderId: string,
  amount: number,
  ageDays: number
): Promise<{ id: string; collectedAt: Date }> {
  return createPaiementAt(
    orderId,
    amount,
    new Date(Date.now() - ageDays * DAY_MS)
  )
}

function createRemboursementAt(
  paymentId: string,
  amount: number,
  refundedAt: Date
): Promise<{ id: string }> {
  return prisma.refund.create({
    data: {
      paymentId,
      amount,
      mode: "cash",
      refundedAt,
      idempotencyKey: `dashboard-refund-${randomUUID()}`,
    },
    select: { id: true },
  })
}

function createRemboursement(
  paymentId: string,
  amount: number,
  ageDays: number
): Promise<{ id: string }> {
  return createRemboursementAt(
    paymentId,
    amount,
    new Date(Date.now() - ageDays * DAY_MS)
  )
}

describe("admin dashboard stats", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: "Catégorie Dashboard", slug: `dashboard-cat-${runId}` },
    })
    const produitStockFaible = await prisma.product.create({
      data: {
        name: "Produit stock faible",
        slug: `dashboard-low-${runId}`,
        description: "",
        brand: "Test",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
        variants: {
          create: [
            {
              name: "Faible",
              sku: `DB-${runId}-LOW`,
              priceDelta: 0,
              stock: LOW_STOCK_THRESHOLD - 1,
            },
            {
              name: "Rupture",
              sku: `DB-${runId}-OUT`,
              priceDelta: 0,
              stock: 0,
            },
          ],
        },
      },
    })
    produitStockFaibleId = produitStockFaible.id
    await prisma.product.create({
      data: {
        name: "Produit stock suffisant",
        slug: `dashboard-ok-${runId}`,
        description: "",
        brand: "Test",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
        variants: {
          create: [
            { name: "OK", sku: `DB-${runId}-OK`, priceDelta: 0, stock: 100 },
          ],
        },
      },
    })
    userIdA = await createUser("a")
  })

  beforeEach(async () => {
    await prisma.refund.deleteMany({
      where: {
        payment: {
          order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
        },
      },
    })
    await prisma.payment.deleteMany({
      where: {
        order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
      },
    })
    await prisma.orderItem.deleteMany({
      where: {
        order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
      },
    })
    await prisma.order.deleteMany({
      where: { user: { email: { startsWith: `dashboard-${runId}-` } } },
    })
  })

  afterAll(async () => {
    await prisma.refund.deleteMany({
      where: {
        payment: {
          order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
        },
      },
    })
    await prisma.payment.deleteMany({
      where: {
        order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
      },
    })
    await prisma.orderItem.deleteMany({
      where: {
        order: { user: { email: { startsWith: `dashboard-${runId}-` } } },
      },
    })
    await prisma.order.deleteMany({
      where: { user: { email: { startsWith: `dashboard-${runId}-` } } },
    })
    await prisma.user.deleteMany({
      where: { email: { startsWith: `dashboard-${runId}-` } },
    })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `dashboard-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: `dashboard-cat-${runId}` },
    })
    await prisma.$disconnect()
  })

  it("ne publie plus les champs morts du contrat", async () => {
    const stats = await getDashboardStats()

    expect(stats.productCount).toBeGreaterThanOrEqual(2)
    expect(stats.lowStockVariants.length).toBeGreaterThanOrEqual(2)
    expect("categoryCount" in stats).toBe(false)
    expect("recentProducts" in stats).toBe(false)
  })

  it("compte les Produits en rupture, y compris ceux qui n'ont aucune Variante", async () => {
    const avant = (await getDashboardStats()).outOfStockCount
    const sansVariante = await prisma.product.create({
      data: {
        name: "Produit sans variante",
        slug: `dashboard-sans-variante-${runId}`,
        description: "",
        brand: "Test",
        price: 1000,
        specs: {},
        images: [],
      },
    })

    try {
      expect((await getDashboardStats()).outOfStockCount).toBe(avant + 1)
    } finally {
      await prisma.product.delete({ where: { id: sansVariante.id } })
    }

    expect((await getDashboardStats()).outOfStockCount).toBe(avant)
  })

  it("lists variants at or below the low-stock threshold with product info", async () => {
    const stats = await getDashboardStats()
    const low = stats.lowStockVariants.filter(
      (v) => v.productId === produitStockFaibleId
    )
    expect(low).toHaveLength(2)
    expect(low[0]).toMatchObject({
      productName: "Produit stock faible",
      stock: 0,
      sku: `DB-${runId}-OUT`,
    })
    expect("productSlug" in low[0]!).toBe(false)
    expect(
      stats.lowStockVariants.some((v) => v.stock > LOW_STOCK_THRESHOLD)
    ).toBe(false)
  })

  describe("chiffre d'affaires lu dans l'argent", () => {
    it("somme les Encaissements de la fenêtre et soustrait les Remboursements, sans lire le Statut", async () => {
      const commandeLivree = await createSeedOrder("delivered", 20)
      const paiement = await createPaiement(commandeLivree, 15000, 29)
      await createPaiement(commandeLivree, 40000, 31)
      const commandeEnAttente = await createSeedOrder("pending", 10)
      await createPaiement(commandeEnAttente, 2500, 5)
      await createRemboursement(paiement.id, 1500, 3)

      const stats = await getDashboardStats()

      expect(stats.chiffreAffairesBrut30j).toBe(17500)
      expect(stats.chiffreAffairesNet30j).toBe(16000)
    })

    it("calcule la variation du net contre la fenêtre précédente, arrondie à un dixième", async () => {
      const commande = await createSeedOrder("delivered", 50)
      await createPaiement(commande, 9000, 45)
      await createPaiement(commande, 12000, 35)
      await createPaiement(commande, 400, 10)

      const stats = await getDashboardStats()

      expect(stats.variationChiffreAffairesNet).toBe(-98.1)
      expect(stats.chiffreAffairesNet30j).toBe(400)
      expect(stats.chiffreAffairesBrut30j).toBe(400)
    })

    it("rend la variation indéfinie quand la fenêtre précédente est à zéro", async () => {
      const commande = await createSeedOrder("delivered", 10)
      await createPaiement(commande, 600, 10)

      const stats = await getDashboardStats()

      expect(stats.variationChiffreAffairesNet).toBeUndefined()
      expect(stats.chiffreAffairesNet30j).toBe(600)
    })

    it("rend une variation négative quand la fenêtre courante est vide et la précédente non", async () => {
      const commande = await createSeedOrder("delivered", 40)
      await createPaiement(commande, 1500, 40)

      const stats = await getDashboardStats()

      expect(stats.variationChiffreAffairesNet).toBe(-100)
      expect(stats.chiffreAffairesNet30j).toBe(0)
    })

    it("ne soustrait pas un Remboursement hors de la fenêtre", async () => {
      const commande = await createSeedOrder("delivered", 50)
      const paiement = await createPaiement(commande, 10000, 10)
      await createRemboursement(paiement.id, 3000, 5)
      await createRemboursement(paiement.id, 2500, 40)

      const stats = await getDashboardStats()

      expect(stats.chiffreAffairesBrut30j).toBe(10000)
      expect(stats.chiffreAffairesNet30j).toBe(7000)
    })

    it("range le net en trente jours calendaires, Encaissements moins Remboursements", async () => {
      const maintenant = new Date()
      const jourLocal = (joursAvant: number, heure = 12) =>
        new Date(
          maintenant.getFullYear(),
          maintenant.getMonth(),
          maintenant.getDate() - joursAvant,
          heure
        )

      const aujourdHui = new Date(maintenant)
      const hier = jourLocal(1)
      const premierJour = jourLocal(29)
      const horsFenetre = jourLocal(31)

      const commande = await createSeedOrder("delivered", 40)
      await createPaiementAt(commande, 1000, aujourdHui)
      const paiementHier = await createPaiementAt(commande, 2000, hier)
      await createPaiementAt(commande, 3000, premierJour)
      await createPaiementAt(commande, 4000, horsFenetre)
      await createRemboursementAt(paiementHier.id, 500, hier)
      await createRemboursementAt(paiementHier.id, 700, horsFenetre)

      const stats = await getDashboardStats("30j")

      expect(stats.chiffreAffairesNet).toHaveLength(30)
      expect(stats.chiffreAffairesNet).toEqual(
        seauxDePeriode("30j", maintenant).map((seau) => ({
          label: libelleDuSeau("30j", seau.debut),
          montant:
            seau.cle === cleDuSeau("30j", aujourdHui)
              ? 1000
              : seau.cle === cleDuSeau("30j", hier)
                ? 1500
                : seau.cle === cleDuSeau("30j", premierJour)
                  ? 3000
                  : 0,
        }))
      )
      expect(stats.chiffreAffairesBrut30j).toBe(6000)
      expect(stats.chiffreAffairesNet30j).toBe(5500)
    })

    it("range le net en treize semaines, du plus ancien au plus récent", async () => {
      const maintenant = new Date()
      const seaux = seauxDePeriode("90j", maintenant)
      const premierJour = new Date(seaux[0]!.debut.getTime() + 12 * 3_600_000)
      const semainePrecedente = new Date(maintenant.getTime() - 7 * DAY_MS)
      const horsFenetre = new Date(seaux[0]!.debut.getTime() - 60_000)

      const commande = await createSeedOrder("delivered", 100)
      await createPaiementAt(commande, 800, premierJour)
      const paiementSemaine = await createPaiementAt(
        commande,
        1600,
        semainePrecedente
      )
      await createPaiementAt(commande, 2400, maintenant)
      await createPaiementAt(commande, 4000, horsFenetre)
      await createRemboursementAt(paiementSemaine.id, 200, semainePrecedente)

      const stats = await getDashboardStats("90j")

      expect(stats.chiffreAffairesNet).toHaveLength(13)
      expect(stats.chiffreAffairesNet).toEqual(
        seaux.map((seau) => ({
          label: libelleDuSeau("90j", seau.debut),
          montant:
            seau.cle === cleDuSeau("90j", premierJour)
              ? 800
              : seau.cle === cleDuSeau("90j", semainePrecedente)
                ? 1400
                : seau.cle === cleDuSeau("90j", maintenant)
                  ? 2400
                  : 0,
        }))
      )
    })

    it("range le net en douze mois calendaires, du plus ancien au plus récent", async () => {
      const nowDate = new Date()
      const currentMonthStart = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        1
      )
      const localMonth = (monthOffset: number, day: number) =>
        new Date(
          currentMonthStart.getFullYear(),
          currentMonthStart.getMonth() - monthOffset,
          day,
          12
        )
      const expectedKeyFor = (monthOffset: number) =>
        cleDuSeau("12mois", localMonth(monthOffset, 15))
      const expectedLabelFor = (monthOffset: number) =>
        libelleDuSeau("12mois", localMonth(monthOffset, 15))

      const commande = await createSeedOrder("delivered", 400)
      await createPaiementAt(commande, 12800, localMonth(7, 15))
      const paiement = await createPaiementAt(commande, 5250, localMonth(3, 15))
      await createPaiementAt(
        commande,
        10000,
        new Date(
          Math.min(currentMonthStart.getTime() + 5 * 60_000, Date.now() - 1_000)
        )
      )
      await createPaiementAt(commande, 4000, localMonth(2, 15))
      await createPaiementAt(commande, 9776, localMonth(13, 15))
      await createRemboursementAt(paiement.id, 250, localMonth(3, 15))

      const stats = await getDashboardStats("12mois")

      const montantParCle = new Map<string, number>()
      montantParCle.set(expectedKeyFor(7), 12800)
      montantParCle.set(expectedKeyFor(3), 5000)
      montantParCle.set(expectedKeyFor(0), 10000)
      montantParCle.set(expectedKeyFor(2), 4000)

      const expected: Array<{ label: string; montant: number }> = []
      for (let offset = 11; offset >= 0; offset--) {
        const cle = expectedKeyFor(offset)
        expected.push({
          label: expectedLabelFor(offset),
          montant: montantParCle.get(cle) ?? 0,
        })
      }

      expect(stats.chiffreAffairesNet).toHaveLength(12)
      expect(stats.chiffreAffairesNet).toEqual(expected)
      expect(stats.chiffreAffairesNet[0]?.label).toBe(expectedLabelFor(11))
      expect(
        stats.chiffreAffairesNet.find(
          (point) => point.label === expectedLabelFor(5)
        )?.montant
      ).toBe(0)
    })

    it("lit le montant de l'Encaissement, jamais une somme recalculée depuis le Sous-total et les Frais de livraison", async () => {
      const commande = await createSeedOrder("delivered", 3, 45000, 5000)
      const collectedAt = new Date(Date.now() - 3 * DAY_MS)
      await createPaiementAt(commande, 38000, collectedAt)

      const stats = await getDashboardStats("12mois")

      expect(stats.chiffreAffairesBrut30j).toBe(38000)
      expect(stats.chiffreAffairesNet30j).toBe(38000)
      expect(
        stats.chiffreAffairesNet.find(
          (point) => point.label === libelleDuSeau("12mois", collectedAt)
        )?.montant
      ).toBe(38000)
      const recente = stats.recentOrders.find((order) => order.id === commande)
      expect(recente).toMatchObject({
        total: 45000,
        totalPayable: 50000,
      })
    })

    it("compte les Commandes récentes sur trente jours, tous Statuts confondus", async () => {
      await createSeedOrder("delivered", 29)
      await createSeedOrder("pending", 25)
      await createSeedOrder("cancelled", 20)
      await createSeedOrder("confirmed", 12)
      await createSeedOrder("shipped", 31)
      await createSeedOrder("returned", 35)

      const stats = await getDashboardStats()

      expect(stats.ordersLast30).toBe(4)
    })

    it("expose totalPayable sur les Commandes récentes", async () => {
      const newerId = await createSeedOrder("delivered", 2, 2550, 450)
      const olderId = await createSeedOrder("cancelled", 4, 6600, 340)

      const stats = await getDashboardStats()

      expect(stats.recentOrders.map((order) => order.id)).toEqual([
        newerId,
        olderId,
      ])
      expect(stats.recentOrders[0]).toMatchObject({
        status: "delivered",
        total: 2550,
        totalPayable: 3000,
        itemCount: 0,
      })
      expect(stats.recentOrders[1]).toMatchObject({
        status: "cancelled",
        total: 6600,
        totalPayable: 6940,
        itemCount: 0,
      })
      expect(stats.recentOrders[0].createdAt.getTime()).toBeGreaterThan(
        stats.recentOrders[1].createdAt.getTime()
      )
    })
  })
})
