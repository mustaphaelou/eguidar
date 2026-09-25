import type {
  BrouillonImageProduit,
  CodeRefusRegistreBrouillon,
  EntreeCreationBrouillonImageProduit,
  PortRegistreBrouillonImageProduit,
  ResultatRevendicationRegistre,
} from "@/lib/cycle-vie-image-produit"
import type {
  CodeEchecStockage,
  PortStockageImageProduit,
  ValeurPromotionBrouillon,
  ValeurPresignBrouillon,
} from "@/lib/r2"

export interface StockageImageProduitMemoire extends PortStockageImageProduit {
  readonly presignatures: Array<{
    draftId: string
    contentType: string
    size: number
  }>
  readonly promotions: Array<{ draftId: string; publicUrl: string }>
  readonly suppressionsBrouillons: string[]
  readonly suppressionsImagesPromues: string[]
  readonly suppressionsImagesPersistees: string[]
  readonly suppressionsImagesCategorie: string[]
  failPresign: boolean
  failPromotion: boolean
  failDelete: boolean
}

function echec(
  code: CodeEchecStockage,
  message: string
): { ok: false; erreur: { code: CodeEchecStockage; message: string } } {
  return { ok: false, erreur: { code, message } }
}

export function creerStockageImageProduitMemoire(): StockageImageProduitMemoire {
  const presignatures: StockageImageProduitMemoire["presignatures"] = []
  const promotions: Array<{ draftId: string; publicUrl: string }> = []
  const suppressionsBrouillons: string[] = []
  const suppressionsImagesPromues: string[] = []
  const suppressionsImagesPersistees: string[] = []
  const suppressionsImagesCategorie: string[] = []

  const stockage: StockageImageProduitMemoire = {
    presignatures,
    promotions,
    suppressionsBrouillons,
    suppressionsImagesPromues,
    suppressionsImagesPersistees,
    suppressionsImagesCategorie,
    failPresign: false,
    failPromotion: false,
    failDelete: false,

    async presignerBrouillon(input) {
      presignatures.push(input)
      if (stockage.failPresign) {
        return echec("erreur-stockage", "échec mémoire de la pré-signature")
      }
      const valeur: ValeurPresignBrouillon = {
        uploadUrl: `memoire://upload/${input.draftId}`,
        previewUrl: `memoire://preview/${input.draftId}`,
      }
      return { ok: true, valeur }
    },

    async supprimerBrouillon(input) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsBrouillons.push(input.draftId)
      return { ok: true, valeur: null }
    },

    async promouvoirBrouillon(input) {
      if (stockage.failPromotion) {
        return echec("erreur-stockage", "échec mémoire de la promotion")
      }
      const publicUrl = `memoire://image/${input.draftId}`
      promotions.push({ draftId: input.draftId, publicUrl })
      const valeur: ValeurPromotionBrouillon = { publicUrl }
      return { ok: true, valeur }
    },

    async supprimerImagePromue(input) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsImagesPromues.push(input.draftId)
      return { ok: true, valeur: null }
    },

    async supprimerImagePersistee(publicUrl) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsImagesPersistees.push(publicUrl)
      return { ok: true, valeur: null }
    },

    async supprimerImageCategorie(publicUrl) {
      if (stockage.failDelete) {
        return echec("erreur-stockage", "échec mémoire de la suppression")
      }
      suppressionsImagesCategorie.push(publicUrl)
      return { ok: true, valeur: null }
    },
  }

  return stockage
}

export interface RegistreImageProduitMemoire extends PortRegistreBrouillonImageProduit {
  readonly records: Map<string, BrouillonImageProduit>
}

function copieBrouillon(
  brouillon: BrouillonImageProduit
): BrouillonImageProduit {
  return {
    ...brouillon,
    createdAt: new Date(brouillon.createdAt),
    expiresAt: new Date(brouillon.expiresAt),
  }
}

function refusRegistre(
  code: CodeRefusRegistreBrouillon,
  message: string
): Extract<ResultatRevendicationRegistre, { ok: false }> {
  return { ok: false, code, message }
}

/**
 * Même règle que le registre durable : la rétention dépassée résout en `expiré`
 * un Brouillon non lié à un Produit, quel que soit son état de revendication.
 * `libéré` reste terminal, un Brouillon lié à un Produit n'est jamais
 * réétiqueté.
 */
function resolubleEnExpire(
  brouillon: BrouillonImageProduit,
  now: Date
): boolean {
  return (
    brouillon.productId === null &&
    brouillon.expiresAt <= now &&
    (brouillon.state === "vivant" || brouillon.state === "revendiqué")
  )
}

export function creerRegistreImageProduitMemoire(
  maintenant: () => Date
): RegistreImageProduitMemoire {
  const records = new Map<string, BrouillonImageProduit>()

  return {
    records,

    async creer(input: EntreeCreationBrouillonImageProduit) {
      const brouillon: BrouillonImageProduit = {
        id: input.id,
        mimeType: input.contentType,
        byteSize: input.byteSize,
        ownerId: input.ownerId,
        tentativeId: null,
        createdAt: maintenant(),
        expiresAt: new Date(input.expiresAt),
        state: "vivant",
        promotedPublicUrl: null,
        productId: null,
      }
      records.set(brouillon.id, brouillon)
      return copieBrouillon(brouillon)
    },

    async lire(id) {
      const brouillon = records.get(id)
      if (!brouillon) return null
      if (resolubleEnExpire(brouillon, maintenant())) {
        brouillon.state = "expiré"
      }
      return copieBrouillon(brouillon)
    },

    async revendiquer(input) {
      const brouillon = records.get(input.id)
      if (!brouillon)
        return refusRegistre("introuvable", "Brouillon introuvable")
      if (brouillon.ownerId !== input.ownerId) {
        return refusRegistre(
          "proprietaire-incorrect",
          "Ce brouillon ne vous appartient pas"
        )
      }
      if (
        brouillon.state === "revendiqué" &&
        brouillon.tentativeId === input.tentativeId
      ) {
        return { ok: true, value: copieBrouillon(brouillon) }
      }
      if (brouillon.expiresAt <= input.now) {
        if (resolubleEnExpire(brouillon, input.now)) {
          brouillon.state = "expiré"
        }
        return refusRegistre("expire", "Ce brouillon a expiré")
      }
      if (brouillon.state !== "vivant" || brouillon.tentativeId !== null) {
        return refusRegistre(
          brouillon.state === "revendiqué"
            ? "deja-revendique"
            : brouillon.state === "libéré"
              ? "deja-libere"
              : "non-vivant",
          brouillon.state === "revendiqué"
            ? "Ce brouillon a déjà été revendiqué"
            : "Ce brouillon n'est pas vivant"
        )
      }
      brouillon.state = "revendiqué"
      brouillon.tentativeId = input.tentativeId
      return { ok: true, value: copieBrouillon(brouillon) }
    },

    async confirmerPromotion(input) {
      const brouillon = records.get(input.id)
      if (
        !brouillon ||
        brouillon.state !== "revendiqué" ||
        brouillon.tentativeId !== input.tentativeId
      ) {
        return false
      }
      if (
        (brouillon.productId !== null &&
          brouillon.productId !== input.productId) ||
        (brouillon.promotedPublicUrl !== null &&
          brouillon.promotedPublicUrl !== input.publicUrl)
      ) {
        return false
      }
      brouillon.productId = input.productId
      brouillon.promotedPublicUrl = input.publicUrl
      return true
    },

    async annulerRevendication(input) {
      const brouillon = records.get(input.id)
      if (
        brouillon?.state === "revendiqué" &&
        brouillon.tentativeId === input.tentativeId &&
        brouillon.productId === null
      ) {
        brouillon.state = "vivant"
        brouillon.tentativeId = null
        brouillon.promotedPublicUrl = null
      }
    },

    async marquerLibere(input) {
      const brouillon = records.get(input.id)
      if (
        !brouillon ||
        brouillon.ownerId !== input.ownerId ||
        brouillon.state !== "vivant"
      ) {
        return false
      }
      brouillon.state = "libéré"
      return true
    },
  }
}

export interface HorlogeControllable {
  horloge: { maintenant(): Date }
  avancer(secondes: number): void
  fixer(date: Date): void
}

export function creerHorlogeControllable(
  dateInitiale: Date
): HorlogeControllable {
  let maintenant = new Date(dateInitiale)
  return {
    horloge: {
      maintenant: () => new Date(maintenant),
    },
    avancer(secondes) {
      maintenant = new Date(maintenant.getTime() + secondes * 1000)
    },
    fixer(date) {
      maintenant = new Date(date)
    },
  }
}
