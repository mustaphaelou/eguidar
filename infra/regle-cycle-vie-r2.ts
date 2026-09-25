/**
 * Source de vérité de la règle de cycle de vie Cloudflare R2 qui expire les
 * Brouillons d'Image produit abandonnés (ADR-0004).
 *
 * Il n'y a ni file, ni worker, ni planificateur : cette règle côté fournisseur
 * est le seul mécanisme d'expiration hors bande. Le préfixe et la rétention ne
 * sont donc jamais retypés ici — ils viennent de `lib/r2.ts` et du module de
 * cycle de vie, sinon la règle pourrait dériver de l'espace de noms qu'elle est
 * censée protéger.
 *
 * `infra/regle-cycle-vie-r2.json` est l'artefact applicable (le corps que
 * Cloudflare reçoit) ; `infra/regle-cycle-vie-r2.test.ts` échoue si le fichier
 * ne correspond plus exactement à ce que ce module décrit.
 */
import { RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT } from "@/lib/cycle-vie-image-produit"
import { DRAFT_PRODUCTS_PREFIX } from "@/lib/r2"

const HEURES_PAR_JOUR = 24

/** R2 n'exprime une expiration qu'en jours entiers, un jour étant le minimum. */
const JOURS_MIN_R2 = 1

export const BUCKET_R2_PAR_DEFAUT = "eguidar"

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

/**
 * Arrondi au jour supérieur : une règle plus courte que la rétention
 * applicative supprimerait l'objet d'un Brouillon encore revendicable.
 */
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
        prefix: DRAFT_PRODUCTS_PREFIX,
        expire: {
          days: joursPourExpiration(
            RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT
          ),
        },
      },
    ],
  }
}
