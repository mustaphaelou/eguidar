import type { OrderStatus } from "@/lib/generated/prisma/client"

export type TonStatut = "neutre" | "intermédiaire" | "positif" | "négatif"

interface SpecStatut {
  libellé: string
  ton: TonStatut
  verbe: string | null
  encaissée: boolean
  réapprovisionne: boolean
}

export const REGISTRE_STATUTS = {
  pending: {
    libellé: "En attente",
    ton: "neutre",
    verbe: null,
    encaissée: false,
    réapprovisionne: false,
  },
  confirmed: {
    libellé: "Confirmée",
    ton: "intermédiaire",
    verbe: "Confirmer",
    encaissée: false,
    réapprovisionne: false,
  },
  shipped: {
    libellé: "Expédiée",
    ton: "positif",
    verbe: "Expédier",
    encaissée: false,
    réapprovisionne: false,
  },
  delivered: {
    libellé: "Livrée",
    ton: "positif",
    verbe: "Marquer livrée",
    encaissée: true,
    réapprovisionne: false,
  },
  cancelled: {
    libellé: "Annulée",
    ton: "négatif",
    verbe: "Annuler",
    encaissée: false,
    réapprovisionne: true,
  },
  returned: {
    libellé: "Retournée",
    ton: "négatif",
    verbe: "Retourner",
    encaissée: false,
    réapprovisionne: true,
  },
} as const satisfies Record<OrderStatus, SpecStatut>

const TRANSITIONS_AUTORISÉES: Record<OrderStatus, readonly OrderStatus[]> = {
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

export const STATUTS_ENCAISSÉS: readonly OrderStatus[] = (
  Object.entries(REGISTRE_STATUTS) as [OrderStatus, SpecStatut][]
)
  .filter(([, spec]) => spec.encaissée)
  .map(([statut]) => statut)

export const STATUTS_VALIDES = Object.keys(REGISTRE_STATUTS) as OrderStatus[]

export const FRAGMENT_WHERE_ENCAISSÉS = {
  status: { in: [...STATUTS_ENCAISSÉS] },
}

export function estEncaissée(statut: OrderStatus): boolean {
  return REGISTRE_STATUTS[statut].encaissée
}

export function peutTransitionner(
  statut: OrderStatus,
  cible: OrderStatus
): boolean {
  return TRANSITIONS_AUTORISÉES[statut].includes(cible)
}

export function transitionsDisponibles(
  statut: OrderStatus
): readonly OrderStatus[] {
  return TRANSITIONS_AUTORISÉES[statut]
}

export function réapprovisionne(statut: OrderStatus): boolean {
  return REGISTRE_STATUTS[statut].réapprovisionne
}

export function estStatut(token: string): token is OrderStatus {
  return (STATUTS_VALIDES as readonly string[]).includes(token)
}
