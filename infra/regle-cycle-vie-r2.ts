import { retentionBrouillonImageProduitHeures } from "@/lib/cycle-vie-image-produit"
import { PREFIXE_BROUILLONS_IMAGE_PRODUIT } from "@/lib/espace-de-noms-image-produit"

const HEURES_PAR_JOUR = 24

const JOURS_MIN_R2 = 1

export const BUCKET_R2_PAR_DEFAUT = process.env.R2_BUCKET || "eguidar"

export interface ExpirationCycleVieR2 {
  days: number
}

export interface RegleCycleVieR2 {
  id: string
  enabled: boolean
  prefix: string
  expire: ExpirationCycleVieR2
}

export interface ArtefactRegleCycleVieR2 {
  bucket: string
  rules: RegleCycleVieR2[]
}

function joursPourExpiration(heures: number): number {
  return Math.max(JOURS_MIN_R2, Math.ceil(heures / HEURES_PAR_JOUR))
}

export function artefactRegleCycleVieR2(): ArtefactRegleCycleVieR2 {
  return {
    bucket: BUCKET_R2_PAR_DEFAUT,
    rules: [
      {
        id: "brouillons-image-produit",
        enabled: true,
        prefix: PREFIXE_BROUILLONS_IMAGE_PRODUIT,
        expire: {
          days: joursPourExpiration(retentionBrouillonImageProduitHeures()),
        },
      },
    ],
  }
}
