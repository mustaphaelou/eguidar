import {
  creerCycleVieImageProduit,
  type BrouillonImageProduit,
  type CodeRefusRegistreBrouillon,
  type EntreeCreationBrouillonImageProduit,
  type PortRegistreBrouillonImageProduit,
  type ResultatRevendicationRegistre,
} from "@/lib/cycle-vie-image-produit"
import {
  PREFIXE_BROUILLONS_IMAGE_PRODUIT,
  PREFIXE_IMAGES_PRODUIT,
  cleDepuisUrlPublique,
} from "@/lib/espace-de-noms-image-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import {
  MAX_UPLOAD_SIZE,
  draftObjectKey,
  persistentObjectKey,
  publicUrlFromKey,
  type CodeEchecStockage,
  type ContentTypeImageProduit,
  type EchecStockageImageProduit,
  type FaitImageProduitVerifiee,
  type PortStockageImageProduit,
  type ResultatStockageImageProduit,
  type ValeurPromotionBrouillon,
  type ValeurPresignBrouillon,
} from "@/lib/r2"
import { inspecterImageProduit } from "@/lib/verification-image-produit"

export const BASE_PUBLIQUE_MEMOIRE = "https://cdn.example.test"

export const BASE_ENVOI_MEMOIRE = "https://upload.example.test"

function urlPublique(cle: string): string {
  const url = publicUrlFromKey(cle, BASE_PUBLIQUE_MEMOIRE)
  if (!url) throw new Error(`Base publique vide : ${BASE_PUBLIQUE_MEMOIRE}`)
  return url
}

function urlEnvoi(cle: string): string {
  return `${BASE_ENVOI_MEMOIRE}/${cle}`
}

function echec(
  code: CodeEchecStockage,
  message: string
): { ok: false; erreur: EchecStockageImageProduit } {
  return { ok: false, erreur: { code, message } }
}

function cleOuRefus(
  deriver: () => string
): ResultatStockageImageProduit<string> {
  try {
    return { ok: true, valeur: deriver() }
  } catch (error) {
    return echec(
      "parametre-invalide",
      error instanceof Error ? error.message : "Paramètre de stockage invalide"
    )
  }
}

function cleSupprimeeParUrl(
  publicUrl: string,
  dansEspaceDeNoms: (cle: string) => boolean
): ResultatStockageImageProduit<string> {
  const cle = cleDepuisUrlPublique(publicUrl, BASE_PUBLIQUE_MEMOIRE)
  if (!cle || !dansEspaceDeNoms(cle)) {
    return echec(
      "parametre-invalide",
      "URL non gérée par le stockage en mémoire"
    )
  }
  return { ok: true, valeur: cle }
}

function estCleImageProduitPersistee(cle: string): boolean {
  return (
    cle.startsWith(PREFIXE_IMAGES_PRODUIT) &&
    !cle.startsWith(PREFIXE_BROUILLONS_IMAGE_PRODUIT)
  )
}

function estCleImageCategorie(cle: string): boolean {
  return !cle.startsWith(PREFIXE_BROUILLONS_IMAGE_PRODUIT)
}

export interface StockageImageProduitMemoire extends PortStockageImageProduit {
  readonly presignatures: Array<{
    draftId: string
    contentType: ContentTypeImageProduit
    size: number
    cle: string
  }>
  readonly verifications: Array<{
    draftId: string
    contentType: ContentTypeImageProduit
    cle: string
  }>
  readonly contenus: Map<string, Buffer>
  contenuParDefaut: Buffer | null
  readonly promotions: Array<{
    draftId: string
    cleSource: string
    cle: string
    publicUrl: string
  }>
  readonly suppressionsBrouillons: string[]
  readonly suppressionsImagesPromues: string[]
  readonly suppressionsImagesPersistees: string[]
  readonly suppressionsImagesCategorie: string[]
  failPresign: boolean
  failPromotion: boolean
  failDelete: boolean
  readonly pannes: Record<OperationStockage, Set<PanneStockage>>
}

export type OperationStockage = keyof PortStockageImageProduit

export type PanneStockage =
  "non-configure" | "parametre-invalide" | "erreur-stockage" | "leve"

export function urlImagePersistee(
  imageId: string,
  contentType: ContentTypeImageProduit
): string {
  return urlPublique(persistentObjectKey(imageId, contentType))
}

export function urlApercuBrouillon(
  draftId: string,
  contentType: ContentTypeImageProduit
): string {
  return urlPublique(draftObjectKey(draftId, contentType))
}

export function urlEnvoiBrouillon(
  draftId: string,
  contentType: ContentTypeImageProduit
): string {
  return urlEnvoi(draftObjectKey(draftId, contentType))
}

export function creerStockageImageProduitMemoire(): StockageImageProduitMemoire {
  const presignatures: StockageImageProduitMemoire["presignatures"] = []
  const verifications: StockageImageProduitMemoire["verifications"] = []
  const contenus: Map<string, Buffer> = new Map()
  const promotions: StockageImageProduitMemoire["promotions"] = []
  const suppressionsBrouillons: string[] = []
  const suppressionsImagesPromues: string[] = []
  const suppressionsImagesPersistees: string[] = []
  const suppressionsImagesCategorie: string[] = []
  const pannes: Record<OperationStockage, Set<PanneStockage>> = {
    presignerBrouillon: new Set(),
    verifierBrouillon: new Set(),
    supprimerBrouillon: new Set(),
    promouvoirBrouillon: new Set(),
    supprimerImagePromue: new Set(),
    supprimerImagePersistee: new Set(),
    supprimerImageCategorie: new Set(),
  }

  function panne(
    operation: OperationStockage,
    brouillard: boolean
  ): { ok: false; erreur: EchecStockageImageProduit } | null {
    const subies = pannes[operation]
    if (subies.has("leve")) {
      throw new Error(`Stockage en mémoire indisponible : ${operation}`)
    }
    if (subies.has("non-configure")) {
      return echec("non-configure", "Stockage en mémoire non configuré")
    }
    if (subies.has("parametre-invalide")) {
      return echec("parametre-invalide", "Paramètre de stockage invalide")
    }
    if (subies.has("erreur-stockage") || brouillard) {
      return echec("erreur-stockage", `échec mémoire de ${operation}`)
    }
    return null
  }

  const stockage: StockageImageProduitMemoire = {
    presignatures,
    verifications,
    contenus,
    contenuParDefaut: null,
    promotions,
    suppressionsBrouillons,
    suppressionsImagesPromues,
    suppressionsImagesPersistees,
    suppressionsImagesCategorie,
    pannes,
    failPresign: false,
    failPromotion: false,
    failDelete: false,

    async presignerBrouillon(input) {
      const resolue = cleOuRefus(() =>
        draftObjectKey(input.draftId, input.contentType)
      )
      if (!resolue.ok) return resolue
      const cle = resolue.valeur
      presignatures.push({ ...input, cle })
      if (
        !Number.isInteger(input.size) ||
        input.size <= 0 ||
        input.size > MAX_UPLOAD_SIZE
      ) {
        return echec(
          "parametre-invalide",
          input.size > MAX_UPLOAD_SIZE
            ? "Fichier trop volumineux (10 Mo maximum)"
            : "Taille de fichier invalide"
        )
      }
      const refus = panne("presignerBrouillon", stockage.failPresign)
      if (refus) return refus
      const valeur: ValeurPresignBrouillon = {
        uploadUrl: urlEnvoi(cle),
        previewUrl: urlPublique(cle),
      }
      return { ok: true, valeur }
    },

    async verifierBrouillon(input) {
      const resolue = cleOuRefus(() =>
        draftObjectKey(input.draftId, input.contentType)
      )
      if (!resolue.ok) return resolue
      const cle = resolue.valeur
      verifications.push({
        draftId: input.draftId,
        contentType: input.contentType,
        cle,
      })
      const refus = panne("verifierBrouillon", false)
      if (refus) return refus

      const octets = contenus.get(cle) ?? stockage.contenuParDefaut
      if (!octets) {
        const valeur: FaitImageProduitVerifiee = {
          mimeType: input.contentType,
          byteSize: 1024,
          width: 640,
          height: 480,
        }
        return { ok: true, valeur }
      }

      const inspection = await inspecterImageProduit(octets)
      if (!inspection.ok) {
        return echec(inspection.code, inspection.message)
      }
      contenus.set(cle, inspection.image.bytes)
      return {
        ok: true,
        valeur: {
          mimeType: inspection.image.mimeType,
          byteSize: inspection.image.byteSize,
          width: inspection.image.width,
          height: inspection.image.height,
        },
      }
    },

    async supprimerBrouillon(input) {
      const resolue = cleOuRefus(() =>
        draftObjectKey(input.draftId, input.contentType)
      )
      if (!resolue.ok) return resolue
      suppressionsBrouillons.push(resolue.valeur)
      const refus = panne("supprimerBrouillon", stockage.failDelete)
      if (refus) return refus
      return { ok: true, valeur: null }
    },

    async promouvoirBrouillon(input) {
      const source = cleOuRefus(() =>
        draftObjectKey(input.draftId, input.contentType)
      )
      if (!source.ok) return source
      const destination = cleOuRefus(() =>
        persistentObjectKey(input.draftId, input.contentType)
      )
      if (!destination.ok) return destination

      const publicUrl = urlPublique(destination.valeur)
      promotions.push({
        draftId: input.draftId,
        cleSource: source.valeur,
        cle: destination.valeur,
        publicUrl,
      })
      const refus = panne("promouvoirBrouillon", stockage.failPromotion)
      if (refus) return refus
      const valeur: ValeurPromotionBrouillon = { publicUrl }
      return { ok: true, valeur }
    },

    async supprimerImagePromue(input) {
      const resolue = cleOuRefus(() =>
        persistentObjectKey(input.draftId, input.contentType)
      )
      if (!resolue.ok) return resolue
      suppressionsImagesPromues.push(resolue.valeur)
      const refus = panne("supprimerImagePromue", stockage.failDelete)
      if (refus) return refus
      return { ok: true, valeur: null }
    },

    async supprimerImagePersistee(publicUrl) {
      const resolue = cleSupprimeeParUrl(publicUrl, estCleImageProduitPersistee)
      if (!resolue.ok) return resolue
      suppressionsImagesPersistees.push(resolue.valeur)
      const refus = panne("supprimerImagePersistee", stockage.failDelete)
      if (refus) return refus
      return { ok: true, valeur: null }
    },

    async supprimerImageCategorie(publicUrl) {
      const resolue = cleSupprimeeParUrl(publicUrl, estCleImageCategorie)
      if (!resolue.ok) return resolue
      suppressionsImagesCategorie.push(resolue.valeur)
      const refus = panne("supprimerImageCategorie", stockage.failDelete)
      if (refus) return refus
      return { ok: true, valeur: null }
    },
  }

  return stockage
}

export type OperationRegistre =
  | "creer"
  | "lire"
  | "lireParTentative"
  | "revendiquer"
  | "confirmerPromotion"
  | "annulerRevendication"
  | "marquerLibere"

export interface RegistreImageProduitMemoire extends PortRegistreBrouillonImageProduit {
  readonly records: Map<string, BrouillonImageProduit>
  readonly pannes: Set<OperationRegistre>
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
  const pannes = new Set<OperationRegistre>()

  function panne(operation: OperationRegistre): void {
    if (pannes.has(operation)) {
      throw new Error(`Registre en mémoire indisponible : ${operation}`)
    }
  }

  return {
    records,
    pannes,

    async creer(input: EntreeCreationBrouillonImageProduit) {
      panne("creer")
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
      panne("lire")
      const brouillon = records.get(id)
      if (!brouillon) return null
      if (resolubleEnExpire(brouillon, maintenant())) {
        brouillon.state = "expiré"
      }
      return copieBrouillon(brouillon)
    },

    async lireParTentative(tentativeId) {
      panne("lireParTentative")
      return [...records.values()]
        .filter((brouillon) => brouillon.tentativeId === tentativeId)
        .sort(
          (premier, second) =>
            premier.createdAt.getTime() - second.createdAt.getTime() ||
            (premier.id < second.id ? -1 : premier.id > second.id ? 1 : 0)
        )
        .map(copieBrouillon)
    },

    async revendiquer(input) {
      panne("revendiquer")
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
      panne("confirmerPromotion")
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
      panne("annulerRevendication")
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
      panne("marquerLibere")
      const brouillon = records.get(input.id)
      const now = maintenant()
      if (
        brouillon &&
        brouillon.ownerId === input.ownerId &&
        brouillon.state === "vivant" &&
        brouillon.expiresAt > now
      ) {
        brouillon.state = "libéré"
        return true
      }
      if (brouillon && resolubleEnExpire(brouillon, now)) {
        brouillon.state = "expiré"
      }
      return false
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

export function persistee(url: string): EntreeImageProduit {
  return { kind: "persistee", url }
}

export function brouillon(draftId: string): EntreeImageProduit {
  return {
    kind: "brouillon",
    draftId,
    previewUrl: `https://preview.test/${draftId}`,
  }
}

export function creerCycleVieTest(dateInitiale: Date) {
  const horloge = creerHorlogeControllable(dateInitiale)
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  const cycleVie = creerCycleVieImageProduit({
    stockage,
    registre,
    horloge: horloge.horloge,
  })
  return { cycleVie, horloge, stockage, registre }
}
