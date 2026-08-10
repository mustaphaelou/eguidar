import { OrderStatus } from "@/lib/generated/prisma/client"

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  returned: "Retournée",
}

export const shortOrderId = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`
