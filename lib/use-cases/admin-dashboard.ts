import { compterExecutionsEnEchec } from "@/lib/automations/historique"
import { prisma } from "@/lib/db"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import { SEUIL_STOCK_FAIBLE } from "@/lib/seuil-stock"
import {
  cleDuSeau,
  libelleDuSeau,
  PERIODE_PAR_DEFAUT,
  seauxDePeriode,
  type Periode,
  type PointDeChiffreAffaires,
} from "@/lib/tableau-de-bord-periode"
import { compterImagesSansAlt } from "@/lib/use-cases/images-produit"

export interface CompteursSurveillance {
  enRupture: number
  sansAlt: number
  echecs: number
}

export interface LowStockVariant {
  id: string
  name: string
  sku: string
  stock: number
  productId: string
  productName: string
}

export interface RecentOrder {
  id: string
  status: OrderStatus
  total: number
  createdAt: Date
  itemCount: number
  totalPayable: number
}

export interface DashboardStats {
  productCount: number
  surveillance: CompteursSurveillance
  orderCount: number
  pendingOrderCount: number
  chiffreAffairesBrut30j: number
  chiffreAffairesNet30j: number
  variationChiffreAffairesNet: number | undefined
  ordersLast30: number
  chiffreAffairesNet: PointDeChiffreAffaires[]
  lowStockVariants: LowStockVariant[]
  recentOrders: RecentOrder[]
}

const DAY_MS = 86_400_000

function last30Window(now: Date) {
  return { start: new Date(now.getTime() - 30 * DAY_MS), end: now }
}

function prior30Window(now: Date, currentStart: Date) {
  return { start: new Date(now.getTime() - 60 * DAY_MS), end: currentStart }
}

export async function getDashboardStats(
  periode: Periode = PERIODE_PAR_DEFAUT
): Promise<DashboardStats> {
  const maintenant = new Date()
  const { start: currentWindowStart, end: currentWindowEnd } =
    last30Window(maintenant)
  const previousWindow = prior30Window(maintenant, currentWindowStart)
  const seaux = seauxDePeriode(periode, maintenant)

  const [
    productCount,
    outOfStockCount,
    imagesSansAlt,
    executionsEnEchec,
    orderCount,
    pendingOrderCount,
    lowStockVariants,
    recentOrders,
    paiementsCourants,
    remboursementsCourants,
    paiementsPrecedents,
    remboursementsPrecedents,
    ordersLast30,
    paiements,
    remboursements,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { variants: { every: { stock: 0 } } } }),
    compterImagesSansAlt(),
    compterExecutionsEnEchec(),
    prisma.order.count(),
    prisma.order.count({ where: { status: "pending" } }),
    prisma.productVariant.findMany({
      where: { stock: { lte: SEUIL_STOCK_FAIBLE } },
      orderBy: { stock: "asc" },
      include: { product: { select: { id: true, name: true } } },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        total: true,
        totalPayable: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        collectedAt: { gte: currentWindowStart, lte: currentWindowEnd },
      },
    }),
    prisma.refund.aggregate({
      _sum: { amount: true },
      where: { refundedAt: { gte: currentWindowStart, lte: currentWindowEnd } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        collectedAt: { gte: previousWindow.start, lt: currentWindowStart },
      },
    }),
    prisma.refund.aggregate({
      _sum: { amount: true },
      where: {
        refundedAt: { gte: previousWindow.start, lt: currentWindowStart },
      },
    }),
    prisma.order.count({
      where: { createdAt: { gte: currentWindowStart, lte: currentWindowEnd } },
    }),
    prisma.payment.findMany({
      where: { collectedAt: { gte: seaux[0]!.debut, lte: maintenant } },
      select: { amount: true, collectedAt: true },
    }),
    prisma.refund.findMany({
      where: { refundedAt: { gte: seaux[0]!.debut, lte: maintenant } },
      select: { amount: true, refundedAt: true },
    }),
  ])

  const chiffreAffairesBrut30j = paiementsCourants._sum.amount ?? 0
  const chiffreAffairesNet30j =
    chiffreAffairesBrut30j - (remboursementsCourants._sum.amount ?? 0)
  const chiffreAffairesNetPrecedent =
    (paiementsPrecedents._sum.amount ?? 0) -
    (remboursementsPrecedents._sum.amount ?? 0)
  const variationChiffreAffairesNet =
    chiffreAffairesNetPrecedent === 0
      ? undefined
      : Math.round(
          ((chiffreAffairesNet30j - chiffreAffairesNetPrecedent) /
            chiffreAffairesNetPrecedent) *
            100 *
            10
        ) / 10

  const montantParCle = new Map(seaux.map((seau) => [seau.cle, 0]))
  for (const paiement of paiements) {
    const cle = cleDuSeau(periode, paiement.collectedAt)
    const montant = montantParCle.get(cle)
    if (montant !== undefined) {
      montantParCle.set(cle, montant + paiement.amount)
    }
  }
  for (const remboursement of remboursements) {
    const cle = cleDuSeau(periode, remboursement.refundedAt)
    const montant = montantParCle.get(cle)
    if (montant !== undefined) {
      montantParCle.set(cle, montant - remboursement.amount)
    }
  }

  return {
    productCount,
    surveillance: {
      enRupture: outOfStockCount,
      sansAlt: imagesSansAlt,
      echecs: executionsEnEchec,
    },
    orderCount,
    pendingOrderCount,
    chiffreAffairesBrut30j,
    chiffreAffairesNet30j,
    variationChiffreAffairesNet,
    ordersLast30,
    chiffreAffairesNet: seaux.map((seau) => ({
      label: libelleDuSeau(periode, seau.debut),
      montant: montantParCle.get(seau.cle) ?? 0,
    })),
    lowStockVariants: lowStockVariants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      stock: variant.stock,
      productId: variant.product.id,
      productName: variant.product.name,
    })),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      totalPayable: order.totalPayable,
    })),
  }
}
