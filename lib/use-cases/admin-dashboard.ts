import { prisma } from "@/lib/db"

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
}

export interface DashboardStats {
  productCount: number
  categoryCount: number
  orderCount: number
  pendingOrderCount: number
  lowStockVariants: LowStockVariant[]
  recentProducts: RecentProduct[]
  recentOrders: RecentOrder[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [productCount, categoryCount, orderCount, pendingOrderCount, lowStockVariants, recentProducts, recentOrders] =
    await Promise.all([
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
        select: { id: true, name: true, slug: true, price: true, isFeatured: true, createdAt: true },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, status: true, total: true, createdAt: true, items: { select: { quantity: true } } },
      }),
    ])

  return {
    productCount,
    categoryCount,
    orderCount,
    pendingOrderCount,
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
    })),
  }
}
