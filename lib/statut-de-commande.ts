import type { OrderStatus } from "@/lib/generated/prisma/client"

export type { OrderStatus } from "@/lib/generated/prisma/client"

export type TonStatut = "neutre" | "intermédiaire" | "positif" | "négatif"

interface SpecStatut {
  libellé: string
  ton: TonStatut
  verbe: string | null
}

export const REGISTRE_STATUTS = {
  pending: {
    libellé: "En attente",
    ton: "neutre",
    verbe: null,
  },
  confirmed: {
    libellé: "Confirmée",
    ton: "intermédiaire",
    verbe: "Confirmer",
  },
  shipped: {
    libellé: "Expédiée",
    ton: "positif",
    verbe: "Expédier",
  },
  delivered: {
    libellé: "Livrée",
    ton: "positif",
    verbe: "Marquer livrée",
  },
  cancelled: {
    libellé: "Annulée",
    ton: "négatif",
    verbe: "Annuler",
  },
  returned: {
    libellé: "Retournée",
    ton: "négatif",
    verbe: "Retourner",
  },
} as const satisfies Record<OrderStatus, SpecStatut>

export const TRANSITIONS_TOUTES_VOIES: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = Object.freeze({
  pending: Object.freeze(["confirmed", "cancelled"] as const),
  confirmed: Object.freeze(["shipped", "cancelled"] as const),
  shipped: Object.freeze(["delivered", "returned"] as const),
  delivered: Object.freeze(["returned"] as const),
  cancelled: Object.freeze([] as const),
  returned: Object.freeze([] as const),
})

export const TRANSITIONS_ADMINISTRATION: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = Object.freeze({
  pending: Object.freeze(["confirmed", "cancelled"] as const),
  confirmed: Object.freeze(["shipped", "cancelled"] as const),
  shipped: Object.freeze(["delivered"] as const),
  delivered: Object.freeze([] as const),
  cancelled: Object.freeze([] as const),
  returned: Object.freeze([] as const),
})

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: REGISTRE_STATUTS.pending.libellé,
  confirmed: REGISTRE_STATUTS.confirmed.libellé,
  shipped: REGISTRE_STATUTS.shipped.libellé,
  delivered: REGISTRE_STATUTS.delivered.libellé,
  cancelled: REGISTRE_STATUTS.cancelled.libellé,
  returned: REGISTRE_STATUTS.returned.libellé,
}

export const STATUTS_VALIDES = Object.keys(REGISTRE_STATUTS) as OrderStatus[]

export function peutTransitionner(
  statut: OrderStatus,
  cible: OrderStatus
): boolean {
  return TRANSITIONS_TOUTES_VOIES[statut].includes(cible)
}

export function transitionsDisponibles(
  statut: OrderStatus
): readonly OrderStatus[] {
  return TRANSITIONS_ADMINISTRATION[statut]
}

export function estStatut(token: string): token is OrderStatus {
  return (STATUTS_VALIDES as readonly string[]).includes(token)
}
