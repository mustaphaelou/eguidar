import { prisma } from "@/lib/db"
import { totalPayable } from "@/lib/money"

export const LOW_STOCK_THRESHOLD = 5

export interface LowStockVariant {
  id: string
  name: string
  sku: string
  stock: number
  productId: string
  productName: string
  productSlug: string
}

export interface RecentProduct {
  id: string
  name: string
  slug: string
  price: number
  isFeatured: boolean
  createdAt: Date
}

export interface RecentOrder {
  id: string
  status: string
  total: number
  createdAt: Date
  itemCount: number
  totalPayable: number
}

export interface RevenueMonth {
  month: string
  revenue: number
}

export interface DashboardStats {
  productCount: number
  categoryCount: number
  orderCount: number
  pendingOrderCount: number
  caEncaisse30j: number
  caDelta: number | undefined
  ordersLast30: number
  revenueByMonth: RevenueMonth[]
  lowStockVariants: LowStockVariant[]
  recentProducts: RecentProduct[]
  recentOrders: RecentOrder[]
}

const DAY_MS = 86_400_000

function localMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function last30Window(nowMs: number) {
  return { start: new Date(nowMs - 30 * DAY_MS), end: new Date(nowMs) }
}

function prior30Window(nowMs: number, previousEnd: Date) {
  return { start: new Date(nowMs - 60 * DAY_MS), end: previousEnd }
}

function last12MonthWindows(nowMs: number) {
  const now = new Date(nowMs)
  const oldestBucketStart = new Date(
    now.getFullYear(),
    now.getMonth() - 11,
    1
  )
  const monthKeys: string[] = []
  for (let offset = 0; offset < 12; offset++) {
    const bucketStart = new Date(
      oldestBucketStart.getFullYear(),
      oldestBucketStart.getMonth() + offset,
      1
    )
    monthKeys.push(localMonthKey(bucketStart))
  }
  return { oldestBucketStart, monthKeys }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const nowMs = Date.now()
  const { start: currentWindowStart, end: now } = last30Window(nowMs)
  const { start: previousWindowStart } = prior30Window(nowMs, now)
  const { oldestBucketStart, monthKeys } = last12MonthWindows(nowMs)

  const [
    productCount,
    categoryCount,
    orderCount,
    pendingOrderCount,
    lowStockVariants,
    recentProducts,
    recentOrders,
    currentWindowSums,
    previousWindowSums,
    ordersLast30,
    twelveMonthRows,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.order.count(),
    prisma.order.count({ where: { status: "pending" } }),
    prisma.productVariant.findMany({
      where: { stock: { lte: LOW_STOCK_THRESHOLD } },
      orderBy: { stock: "asc" },
      include: { product: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        isFeatured: true,
        createdAt: true,
      },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        total: true,
        shippingFee: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
    prisma.order.aggregate({
      _sum: { total: true, shippingFee: true },
      where: {
        status: "delivered",
        createdAt: { gte: currentWindowStart, lte: now },
      },
    }),
    prisma.order.aggregate({
      _sum: { total: true, shippingFee: true },
      where: {
        status: "delivered",
        createdAt: { gte: previousWindowStart, lt: currentWindowStart },
      },
    }),
    prisma.order.count({
      where: { createdAt: { gte: currentWindowStart, lte: now } },
    }),
    prisma.order.findMany({
      where: {
        status: "delivered",
        createdAt: { gte: oldestBucketStart, lte: now },
      },
      select: { id: true, total: true, shippingFee: true, createdAt: true },
    }),
  ])

  const caEncaisse30j = totalPayable({
    total: currentWindowSums._sum.total ?? 0,
    shippingFee: currentWindowSums._sum.shippingFee ?? 0,
  })
  const priorCaEncaisse = totalPayable({
    total: previousWindowSums._sum.total ?? 0,
    shippingFee: previousWindowSums._sum.shippingFee ?? 0,
  })
  const caDelta =
    priorCaEncaisse === 0
      ? undefined
      : Math.round(
          ((caEncaisse30j - priorCaEncaisse) / priorCaEncaisse) * 100 * 10
        ) / 10

  const revenueByKey = new Map<string, number>()
  for (const row of twelveMonthRows) {
    const key = localMonthKey(row.createdAt)
    revenueByKey.set(key, (revenueByKey.get(key) ?? 0) + totalPayable(row))
  }

  return {
    productCount,
    categoryCount,
    orderCount,
    pendingOrderCount,
    caEncaisse30j,
    caDelta,
    ordersLast30,
    revenueByMonth: monthKeys.map((month) => ({
      month,
      revenue: revenueByKey.get(month) ?? 0,
    })),
    lowStockVariants: lowStockVariants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      stock: variant.stock,
      productId: variant.product.id,
      productName: variant.product.name,
      productSlug: variant.product.slug,
    })),
    recentProducts,
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      totalPayable: totalPayable(order),
    })),
  }
}
