import { OrderStatus } from "@/lib/generated/prisma/client"

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  returned: "Retournée",
}

export { shortOrderId } from "@/lib/utils"
