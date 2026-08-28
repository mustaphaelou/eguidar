import { PAGE_SIZES } from "@/lib/table-config"
import { prisma } from "@/lib/db"
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client"
import { totalPayable } from "@/lib/money"
import { ORDER_STATUS_LABELS } from "@/lib/order-status"
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

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

export interface AdminOrdersParams {
  statuses?: OrderStatus[]
  q?: string
  tri?: "date" | "total"
  sens?: "asc" | "desc"
  page?: number
  pageSize?: (typeof PAGE_SIZES)[number]
}

export interface AdminOrdersPage {
  orders: AdminOrderSummary[]
  totalCount: number
  pageCount: number
}

function firstValue(
  raw: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

export function parseAdminOrdersSearchParams(
  raw: Record<string, string | string[] | undefined>
): AdminOrdersParams {
  const statusTokens = (firstValue(raw, "statut") ?? "").split(",")
  const statuses = [
    ...new Set(
      statusTokens
        .map((token) => token.trim())
        .filter((token): token is OrderStatus =>
          (ALL_STATUSES as readonly string[]).includes(token)
        )
    ),
  ]

  const pageRaw = Number(firstValue(raw, "page"))
  const pageSizeRaw = Number(firstValue(raw, "pageSize"))
  const triRaw = firstValue(raw, "tri")
  const sensRaw = firstValue(raw, "sens")
  const qRaw = firstValue(raw, "q")?.trim()

  return {
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(qRaw ? { q: qRaw } : {}),
    tri: triRaw === "date" || triRaw === "total" ? triRaw : "date",
    sens: sensRaw === "asc" || sensRaw === "desc" ? sensRaw : "desc",
    page: Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
      ? (pageSizeRaw as (typeof PAGE_SIZES)[number])
      : PAGE_SIZES[0],
  }
}

function buildOrdersWhere(params?: AdminOrdersParams): Prisma.OrderWhereInput {
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
  params?: AdminOrdersParams
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
  params: AdminOrdersParams
): Promise<AdminOrdersPage>
export async function listAdminOrders(
  params?: AdminOrdersParams
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
