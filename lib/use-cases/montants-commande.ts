import type { ValidatedSelectionDevis } from "@/lib/use-cases/devis"

export interface MontantsDeLaCommande {
  total: number
  shippingFee: number
  totalPayable: number
}

export function montantsDeLaCommande(
  sousTotal: number,
  selection: ValidatedSelectionDevis
): MontantsDeLaCommande {
  return {
    total: sousTotal,
    shippingFee: selection.devis.shippingFee,
    totalPayable: selection.devis.total,
  }
}
