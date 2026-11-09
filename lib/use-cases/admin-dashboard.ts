import { prisma } from "@/lib/db"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import { FRAGMENT_WHERE_ENCAISSÉS } from "@/lib/statut-de-commande"
import {
  cleDuSeau,
  PERIODE_PAR_DEFAUT,
  seauxDePeriode,
  type Periode,
} from "@/lib/tableau-de-bord-periode"

export const LOW_STOCK_THRESHOLD = 5

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

/** Un seau de Chiffre d'affaires encaissé : sa clé locale et sa somme en centimes. */
export interface SeauChiffreAffaires {
  cle: string
  montant: number
}

export interface DashboardStats {
  productCount: number
  outOfStockCount: number
  orderCount: number
  pendingOrderCount: number
  caEncaisse30j: number
  caDelta: number | undefined
  ordersLast30: number
  chiffreAffairesEncaisse: SeauChiffreAffaires[]
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

/**
 * Le contrat du Tableau de bord : les compteurs, les fenêtres fixes de 30 jours
 * (CA, delta, commandes récentes) et les seaux du graphique pour la période
 * demandée. `periode` est optionnel pour les consommateurs qui ne lisent qu'un
 * compteur, comme le digest du stock bas.
 */
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
    orderCount,
    pendingOrderCount,
    lowStockVariants,
    recentOrders,
    currentWindowSums,
    previousWindowSums,
    ordersLast30,
    encaissements,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { variants: { every: { stock: 0 } } } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: "pending" } }),
    prisma.productVariant.findMany({
      where: { stock: { lte: LOW_STOCK_THRESHOLD } },
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
    prisma.order.aggregate({
      _sum: { totalPayable: true },
      where: {
        ...FRAGMENT_WHERE_ENCAISSÉS,
        createdAt: { gte: currentWindowStart, lte: currentWindowEnd },
      },
    }),
    prisma.order.aggregate({
      _sum: { totalPayable: true },
      where: {
        ...FRAGMENT_WHERE_ENCAISSÉS,
        createdAt: { gte: previousWindow.start, lt: currentWindowStart },
      },
    }),
    prisma.order.count({
      where: { createdAt: { gte: currentWindowStart, lte: currentWindowEnd } },
    }),
    prisma.order.findMany({
      where: {
        ...FRAGMENT_WHERE_ENCAISSÉS,
        createdAt: { gte: seaux[0]!.debut, lte: maintenant },
      },
      select: { totalPayable: true, createdAt: true },
    }),
  ])

  const caEncaisse30j = currentWindowSums._sum.totalPayable ?? 0
  const priorCaEncaisse = previousWindowSums._sum.totalPayable ?? 0
  const caDelta =
    priorCaEncaisse === 0
      ? undefined
      : Math.round(
          ((caEncaisse30j - priorCaEncaisse) / priorCaEncaisse) * 100 * 10
        ) / 10

  const montantParCle = new Map(seaux.map((seau) => [seau.cle, 0]))
  for (const commande of encaissements) {
    const cle = cleDuSeau(periode, commande.createdAt)
    const montant = montantParCle.get(cle)
    if (montant !== undefined) {
      montantParCle.set(cle, montant + commande.totalPayable)
    }
  }

  return {
    productCount,
    outOfStockCount,
    orderCount,
    pendingOrderCount,
    caEncaisse30j,
    caDelta,
    ordersLast30,
    chiffreAffairesEncaisse: seaux.map((seau) => ({
      cle: seau.cle,
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
