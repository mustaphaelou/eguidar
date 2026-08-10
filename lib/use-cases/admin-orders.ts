import { prisma } from "@/lib/db"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import { OrderNotFoundError } from "@/lib/use-cases/orders"

export interface AdminOrderSummary {
  id: string
  status: OrderStatus
  total: number
  shippingFee: number
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
  createdAt: Date
  customerName: string
  customerEmail: string
  items: AdminOrderItem[]
}

export async function listAdminOrders(): Promise<AdminOrderSummary[]> {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      items: { select: { quantity: true } },
    },
  })
  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    total: order.total,
    shippingFee: order.shippingFee,
    createdAt: order.createdAt,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    customerName: order.user.name,
    customerEmail: order.user.email,
  }))
}

export async function getAdminOrder(orderId: string): Promise<AdminOrderDetail> {
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
