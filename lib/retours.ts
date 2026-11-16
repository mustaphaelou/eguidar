import type {
  ReturnLineCondition,
  ReturnReason,
  ReturnRefusalCode,
} from "@/lib/generated/prisma/client"

export const MOTIFS_RETOUR = [
  "withdrawal",
  "non_conformity",
  "goodwill",
  "other",
] as const satisfies readonly ReturnReason[]

export type MotifRetour = (typeof MOTIFS_RETOUR)[number]

export const CODES_REFUS_RETOUR = [
  "out_of_window",
  "excluded_by_law",
  "not_received",
  "condition_mismatch",
  "other",
] as const satisfies readonly ReturnRefusalCode[]

export type CodeRefusRetour = (typeof CODES_REFUS_RETOUR)[number]

export const ETATS_LIGNE_RETOUR = [
  "resellable",
  "damaged",
] as const satisfies readonly ReturnLineCondition[]

export type EtatLigneRetour = (typeof ETATS_LIGNE_RETOUR)[number]

export const FENETRE_RETRACTATION_JOURS = 7

const JOUR_EN_MS = 24 * 60 * 60 * 1000

export function motifEnregistre({
  motif,
  requestedAt,
  deliveredAt,
}: {
  motif: MotifRetour
  requestedAt: Date
  deliveredAt: Date | null
}): MotifRetour {
  if (motif !== "withdrawal" || deliveredAt === null) return motif
  const limite = deliveredAt.getTime() + FENETRE_RETRACTATION_JOURS * JOUR_EN_MS
  return requestedAt.getTime() > limite ? "goodwill" : motif
}

export interface QuantiteCommandee {
  orderItemId: string
  quantity: number
}

export function toutesLesUnitesSontRevenues(
  quantitesCommandees: readonly QuantiteCommandee[],
  quantitesRecues: Readonly<Record<string, number>>
): boolean {
  return quantitesCommandees.every(
    (article) => (quantitesRecues[article.orderItemId] ?? 0) >= article.quantity
  )
}
