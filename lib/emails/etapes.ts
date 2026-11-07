import type { OrderStatus } from "@/lib/statut-de-commande"

export const ETAPES = ["Reçue", "Confirmée", "Expédiée", "Livrée"] as const

export type EtapeDeCommande = 1 | 2 | 3 | 4 | "arrêté"

const ETAPE_PAR_STATUT: Record<OrderStatus, EtapeDeCommande> = {
  pending: 1,
  confirmed: 2,
  shipped: 3,
  delivered: 4,
  cancelled: "arrêté",
  returned: "arrêté",
}

export function etapeDe(statut: OrderStatus): EtapeDeCommande {
  return ETAPE_PAR_STATUT[statut]
}
