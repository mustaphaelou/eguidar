import { OrderStatus } from "@/lib/generated/prisma/client"

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  returned: "Retournée",
}

export const STATUTS_ENCAISSÉS: readonly OrderStatus[] = ["delivered"]

export function estEncaissée(statut: OrderStatus): boolean {
  return STATUTS_ENCAISSÉS.includes(statut)
}

export { shortOrderId } from "@/lib/utils"
