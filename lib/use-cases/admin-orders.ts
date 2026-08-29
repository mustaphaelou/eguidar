import type { CommandeListingParams } from "@/lib/commande-listing"
import { PAGE_SIZES } from "@/lib/table-config"
import { prisma } from "@/lib/db"
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client"
import { totalPayable } from "@/lib/money"
import { OrderNotFoundError } from "@/lib/use-cases/orders"

export interface AdminOrderSummary {
  id: string
  status: OrderStatus
  total: number
  shippingFee: number
  totalPayable: number
  createdAt: Date
  itemCount: number
  customerName: string
  customerEmail: string
}

export interface AdminOrderItem {
  id: string
  productName: string
  variantName: string
  price: number
  quantity: number
}

export interface AdminOrderDetail {
  id: string
  status: OrderStatus
  cityName: string
  address: string
  phone: string
  total: number
  shippingFee: number
  totalPayable: number
  createdAt: Date
  customerName: string
  customerEmail: string
  items: AdminOrderItem[]
}

export interface AdminOrdersPage {
  orders: AdminOrderSummary[]
  totalCount: number
  pageCount: number
}

function buildOrdersWhere(
  params?: CommandeListingParams
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {}
  if (params?.statuses && params.statuses.length > 0) {
    where.status = { in: params.statuses }
  }
  if (params?.q) {
    where.user = {
      OR: [
        { name: { contains: params.q, mode: "insensitive" } },
        { email: { contains: params.q, mode: "insensitive" } },
      ],
    }
  }
  return where
}

async function runListAdminOrders(
  params?: CommandeListingParams
): Promise<AdminOrdersPage> {
  const where = buildOrdersWhere(params)
  const sens = params?.sens ?? "desc"
  // 'total' proxies Total à payer (= total + shippingFee); Prisma sorts a single field only.
  const orderBy: Prisma.OrderOrderByWithRelationInput =
    params?.tri === "total" ? { total: sens } : { createdAt: sens }
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? PAGE_SIZES[0]

  const [orders, totalCount] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        user: { select: { name: true, email: true } },
        items: { select: { quantity: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return {
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      shippingFee: order.shippingFee,
      totalPayable: totalPayable(order),
      createdAt: order.createdAt,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      customerName: order.user.name,
      customerEmail: order.user.email,
    })),
    totalCount,
    pageCount: Math.ceil(totalCount / pageSize),
  }
}

export async function listAdminOrders(): Promise<AdminOrderSummary[]>
export async function listAdminOrders(
  params: CommandeListingParams
): Promise<AdminOrdersPage>
export async function listAdminOrders(
  params?: CommandeListingParams
): Promise<AdminOrdersPage | AdminOrderSummary[]> {
  const result = await runListAdminOrders(params)
  return params ? result : result.orders
}

export async function getAdminOrder(
  orderId: string
): Promise<AdminOrderDetail> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, email: true } },
      items: true,
    },
  })
  if (!order) throw new OrderNotFoundError()

  return {
    id: order.id,
    status: order.status,
    cityName: order.cityName,
    address: order.address,
    phone: order.phone,
    total: order.total,
    shippingFee: order.shippingFee,
    totalPayable: totalPayable(order),
    createdAt: order.createdAt,
    customerName: order.user.name,
    customerEmail: order.user.email,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
    })),
  }
}
