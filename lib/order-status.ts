import type { OrderStatus } from "@/lib/generated/prisma/client"

export type TonStatut = "neutre" | "intermédiaire" | "positif" | "négatif"

interface SpecStatut {
  libellé: string
  ton: TonStatut
  verbe: string | null
  encaissée: boolean
}

export const REGISTRE_STATUTS = {
  pending: {
    libellé: "En attente",
    ton: "neutre",
    verbe: null,
    encaissée: false,
  },
  confirmed: {
    libellé: "Confirmée",
    ton: "intermédiaire",
    verbe: "Confirmer",
    encaissée: false,
  },
  shipped: {
    libellé: "Expédiée",
    ton: "positif",
    verbe: "Expédier",
    encaissée: false,
  },
  delivered: {
    libellé: "Livrée",
    ton: "positif",
    verbe: "Marquer livrée",
    encaissée: true,
  },
  cancelled: {
    libellé: "Annulée",
    ton: "négatif",
    verbe: "Annuler",
    encaissée: false,
  },
  returned: {
    libellé: "Retournée",
    ton: "négatif",
    verbe: "Retourner",
    encaissée: false,
  },
} as const satisfies Record<OrderStatus, SpecStatut>

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: REGISTRE_STATUTS.pending.libellé,
  confirmed: REGISTRE_STATUTS.confirmed.libellé,
  shipped: REGISTRE_STATUTS.shipped.libellé,
  delivered: REGISTRE_STATUTS.delivered.libellé,
  cancelled: REGISTRE_STATUTS.cancelled.libellé,
  returned: REGISTRE_STATUTS.returned.libellé,
}

export const STATUTS_ENCAISSÉS = Object.entries(REGISTRE_STATUTS)
  .filter(([, spec]) => spec.encaissée)
  .map(([statut]) => statut) as unknown as readonly ["delivered"]

export const STATUTS_VALIDES = Object.keys(REGISTRE_STATUTS) as OrderStatus[]

export const FRAGMENT_WHERE_ENCAISSÉS = {
  status: { in: [...STATUTS_ENCAISSÉS] },
}

export function estEncaissée(statut: OrderStatus): boolean {
  return REGISTRE_STATUTS[statut].encaissée
}
