/**
 * Les règles pures du Retour : le vocabulaire fermé des motifs et des codes de
 * refus, et la fenêtre de rétractation. Module neutre — un seul import de type,
 * aucune lecture, aucune écriture ; le cas d'usage porte la transaction.
 */

import type {
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

/** La fenêtre légale de rétractation court à partir de la livraison. */
export const FENETRE_RETRACTATION_JOURS = 7

const JOUR_EN_MS = 24 * 60 * 60 * 1000

/**
 * Le motif qui est réellement enregistré. Une rétractation demandée plus de
 * sept jours après la livraison est un geste commercial : la fenêtre légale ne
 * se réécrit pas après coup. Sans date de livraison, la fenêtre n'a pas
 * commencé ; le motif déclaré reste donc le motif enregistré.
 */
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
