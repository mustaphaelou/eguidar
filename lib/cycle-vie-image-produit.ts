import "server-only"

import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"
import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  MAX_UPLOAD_SIZE,
  draftObjectKey,
  stockageImageProduitR2,
  type PortStockageImageProduit,
  type ResultatStockageImageProduit,
} from "@/lib/r2"

export type {
  PortStockageImageProduit,
  ResultatStockageImageProduit,
} from "@/lib/r2"

export const ETATS_BROUILLON_IMAGE_PRODUIT = [
  "vivant",
  "revendiqué",
  "libéré",
  "expiré",
] as const

export type EtatBrouillonImageProduit =
  (typeof ETATS_BROUILLON_IMAGE_PRODUIT)[number]

export interface BrouillonImageProduit {
  id: string
  mimeType: string
  byteSize: number
  ownerId: string
  tentativeId: string | null
  createdAt: Date
  expiresAt: Date
  state: EtatBrouillonImageProduit
  promotedPublicUrl: string | null
  productId: string | null
}

export interface DemandeBrouillonImageProduit {
  ownerId: string
  contentType: string
  size: number
}

export type CodeRefusCycleVieImageProduit =
  | "identifiant-proprietaire-invalide"
  | "metadata-invalide"
  | "mime-non-autorise"
  | "taille-invalide"
  | "trop-volumineux"
  | "stockage-indisponible"
  | "stockage-refuse"
  | "registre-indisponible"
  | "brouillon-introuvable"
  | "proprietaire-incorrect"
  | "brouillon-non-vivant"
  | "brouillon-expire"
  | "revendication-refusee"
  | "catalogue-refuse"

export interface RefusCycleVieImageProduit {
  ok: false
  code: CodeRefusCycleVieImageProduit
  message: string
}

export interface BrouillonImageProduitDemande {
  draftId: string
  uploadUrl: string
  previewUrl: string
  expiresAt: Date
}

export type ResultatDemandeBrouillonImageProduit =
  ({ ok: true } & BrouillonImageProduitDemande) | RefusCycleVieImageProduit

export type ResultatRelacherBrouillonImageProduit =
  { ok: true; draftId: string } | RefusCycleVieImageProduit

export interface ImageProduitPromue {
  draftId: string
  publicUrl: string
}

export interface ResultatEnregistrementCatalogue<TResult> {
  productId: string
  result: TResult
}

export type EnregistrerCatalogue<TResult> = (
  images: readonly ImageProduitPromue[]
) => Promise<ResultatEnregistrementCatalogue<TResult>>

export type ResultatRevendiquerEtEnregistrer<TResult> =
  | {
      ok: true
      productId: string
      result: TResult
      images: readonly ImageProduitPromue[]
    }
  | RefusCycleVieImageProduit

export interface Horloge {
  maintenant(): Date
}

export interface EntreeCreationBrouillonImageProduit {
  id: string
  ownerId: string
  contentType: string
  byteSize: number
  expiresAt: Date
}

export type CodeRefusRegistreBrouillon =
  | "introuvable"
  | "proprietaire-incorrect"
  | "non-vivant"
  | "expire"
  | "deja-revendique"

export type ResultatRevendicationRegistre =
  | { ok: true; value: BrouillonImageProduit }
  | {
      ok: false
      code: CodeRefusRegistreBrouillon
      message: string
    }

export interface PortRegistreBrouillonImageProduit {
  creer(
    input: EntreeCreationBrouillonImageProduit
  ): Promise<BrouillonImageProduit>
  lire(id: string): Promise<BrouillonImageProduit | null>
  revendiquer(input: {
    id: string
    ownerId: string
    tentativeId: string
    now: Date
  }): Promise<ResultatRevendicationRegistre>
  confirmerPromotion(input: {
    id: string
    tentativeId: string
    productId: string
    publicUrl: string
  }): Promise<boolean>
  annulerRevendication(input: {
    id: string
    tentativeId: string
  }): Promise<void>
  marquerLibere(input: { id: string; ownerId: string }): Promise<boolean>
}

export interface CycleVieImageProduit {
  demanderBrouillon(
    input: DemandeBrouillonImageProduit
  ): Promise<ResultatDemandeBrouillonImageProduit>
  relacherBrouillon(input: {
    draftId: string
    ownerId: string
  }): Promise<ResultatRelacherBrouillonImageProduit>
  revendiquerEtEnregistrer<TResult>(input: {
    tentativeId: string
    ownerId: string
    draftIds: readonly string[]
    enregistrer: EnregistrerCatalogue<TResult>
  }): Promise<ResultatRevendiquerEtEnregistrer<TResult>>
  lireBrouillon(id: string): Promise<BrouillonImageProduit | null>
}

/**
 * Rétention initiale d'un Brouillon d'Image produit abandonné, en heures.
 * Exportée parce que la règle de cycle de vie R2 doit porter la même valeur
 * (ADR-0004) : `infra/regle-cycle-vie-r2.ts` en dérive ses jours.
 */
export const RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT = 24

function retentionBrouillonImageProduitHeures(): number {
  const valeur = process.env.RETENTION_BROUILLON_IMAGE_PRODUIT_H
  if (!valeur) return RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT
  const heures = Number(valeur)
  return Number.isFinite(heures) && heures > 0
    ? heures
    : RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT
}

function refus(
  code: CodeRefusCycleVieImageProduit,
  message: string
): RefusCycleVieImageProduit {
  return { ok: false, code, message }
}

/**
 * Refus honnête : au-delà de la rétention, l'objet peut déjà avoir été
 * supprimé par la règle de cycle de vie R2, donc la seule issue est un
 * nouveau téléversement. Aucun nettoyage n'est tenté ici.
 */
const MESSAGE_BROUILLON_EXPIRE =
  "Ce Brouillon d'Image produit a expiré et son fichier peut déjà avoir été supprimé du stockage. Téléversez à nouveau l'image."

function refusStockage(
  resultat: Extract<ResultatStockageImageProduit<unknown>, { ok: false }>
): RefusCycleVieImageProduit {
  if (resultat.erreur.code === "non-configure") {
    return refus("stockage-indisponible", resultat.erreur.message)
  }
  return refus("stockage-refuse", resultat.erreur.message)
}

function validerMetadata(
  input: DemandeBrouillonImageProduit
): RefusCycleVieImageProduit | null {
  if (typeof input.ownerId !== "string" || !input.ownerId.trim()) {
    return refus(
      "identifiant-proprietaire-invalide",
      "Identifiant de propriétaire invalide"
    )
  }
  if (
    !CONTENT_TYPES_IMAGE_PRODUIT.some(
      (contentType) => contentType === input.contentType
    )
  ) {
    return refus("mime-non-autorise", "Type de fichier non pris en charge")
  }
  if (!Number.isInteger(input.size) || input.size <= 0) {
    return refus("taille-invalide", "Taille de fichier invalide")
  }
  if (input.size > MAX_UPLOAD_SIZE) {
    return refus("trop-volumineux", "Fichier trop volumineux (10 Mo maximum)")
  }
  return null
}

function dateDExpiration(now: Date): Date {
  return new Date(
    now.getTime() + retentionBrouillonImageProduitHeures() * 60 * 60 * 1000
  )
}

function resultatRegistreRefus(
  resultat: Extract<ResultatRevendicationRegistre, { ok: false }>
): RefusCycleVieImageProduit {
  switch (resultat.code) {
    case "introuvable":
      return refus("brouillon-introuvable", resultat.message)
    case "proprietaire-incorrect":
      return refus("proprietaire-incorrect", resultat.message)
    case "expire":
      return refus("brouillon-expire", MESSAGE_BROUILLON_EXPIRE)
    case "non-vivant":
    case "deja-revendique":
      return refus("brouillon-non-vivant", resultat.message)
  }
}

function versBrouillon(row: {
  id: string
  mimeType: string
  byteSize: number
  ownerId: string
  tentativeId: string | null
  createdAt: Date
  expiresAt: Date
  state: string
  promotedPublicUrl: string | null
  productId: string | null
}): BrouillonImageProduit {
  return {
    id: row.id,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    ownerId: row.ownerId,
    tentativeId: row.tentativeId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    state: row.state as EtatBrouillonImageProduit,
    promotedPublicUrl: row.promotedPublicUrl,
    productId: row.productId,
  }
}

const selectionBrouillon = {
  id: true,
  mimeType: true,
  byteSize: true,
  ownerId: true,
  tentativeId: true,
  createdAt: true,
  expiresAt: true,
  state: true,
  promotedPublicUrl: true,
  productId: true,
} as const

const horlogeSysteme: Horloge = {
  maintenant: () => new Date(),
}

/**
 * Registre durable. L'état `expiré` est écrit à la demande, à partir de
 * l'horloge injectée : aucun balayeur, aucune file, aucun planificateur. Une
 * lecture, une tentative de revendication ou de libération d'un Brouillon dont
 * `expiresAt` est passé suffit à résoudre puis à persister l'état, pour que le
 * support puisse l'expliquer sans passer par R2.
 */
export function creerRegistreBrouillonImageProduitPrisma(
  horloge: Horloge
): PortRegistreBrouillonImageProduit {
  async function marquerExpire(id: string, now: Date): Promise<void> {
    try {
      await prisma.brouillonImageProduit.updateMany({
        where: { id, state: "vivant", expiresAt: { lte: now } },
        data: { state: "expiré" },
      })
    } catch (error) {
      console.warn(
        `[brouillon-image-produit] état expiré non écrit pour ${id}`,
        error
      )
    }
  }

  return {
    async creer(input) {
      const row = await prisma.brouillonImageProduit.create({
        data: {
          id: input.id,
          storageKey: draftObjectKey(input.id, input.contentType),
          mimeType: input.contentType,
          byteSize: input.byteSize,
          ownerId: input.ownerId,
          tentativeId: null,
          expiresAt: input.expiresAt,
          state: "vivant",
          promotedPublicUrl: null,
          productId: null,
        },
        select: selectionBrouillon,
      })
      return versBrouillon(row)
    },

    async lire(id) {
      const now = horloge.maintenant()
      const row = await prisma.brouillonImageProduit.findUnique({
        where: { id },
        select: selectionBrouillon,
      })
      if (!row) return null
      if (row.state === "vivant" && row.expiresAt <= now) {
        await marquerExpire(id, now)
        return { ...versBrouillon(row), state: "expiré" }
      }
      return versBrouillon(row)
    },

    async revendiquer(input) {
      const updated = await prisma.brouillonImageProduit.updateMany({
        where: {
          id: input.id,
          ownerId: input.ownerId,
          state: "vivant",
          tentativeId: null,
          expiresAt: { gt: input.now },
        },
        data: { state: "revendiqué", tentativeId: input.tentativeId },
      })
      if (updated.count === 1) {
        const row = await prisma.brouillonImageProduit.findUnique({
          where: { id: input.id },
          select: selectionBrouillon,
        })
        if (row) return { ok: true, value: versBrouillon(row) }
      }

      const row = await prisma.brouillonImageProduit.findUnique({
        where: { id: input.id },
        select: selectionBrouillon,
      })
      if (!row) {
        return {
          ok: false,
          code: "introuvable",
          message: "Brouillon introuvable",
        }
      }
      if (row.ownerId !== input.ownerId) {
        return {
          ok: false,
          code: "proprietaire-incorrect",
          message: "Ce brouillon ne vous appartient pas",
        }
      }
      if (row.expiresAt <= input.now) {
        await marquerExpire(input.id, input.now)
        return {
          ok: false,
          code: "expire",
          message: "Brouillon expiré",
        }
      }
      return {
        ok: false,
        code: row.state === "revendiqué" ? "deja-revendique" : "non-vivant",
        message: "Ce brouillon n'est pas vivant",
      }
    },

    async confirmerPromotion(input) {
      const updated = await prisma.brouillonImageProduit.updateMany({
        where: {
          id: input.id,
          tentativeId: input.tentativeId,
          state: "revendiqué",
        },
        data: {
          productId: input.productId,
          promotedPublicUrl: input.publicUrl,
        },
      })
      return updated.count === 1
    },

    async annulerRevendication(input) {
      await prisma.brouillonImageProduit.updateMany({
        where: { id: input.id, tentativeId: input.tentativeId },
        data: { state: "vivant", tentativeId: null },
      })
    },

    async marquerLibere(input) {
      const now = horloge.maintenant()
      const updated = await prisma.brouillonImageProduit.updateMany({
        where: {
          id: input.id,
          ownerId: input.ownerId,
          state: "vivant",
          expiresAt: { gt: now },
        },
        data: { state: "libéré" },
      })
      if (updated.count === 1) return true
      await marquerExpire(input.id, now)
      return false
    },
  }
}

export const registreBrouillonImageProduitPrisma =
  creerRegistreBrouillonImageProduitPrisma(horlogeSysteme)

export interface DependancesCycleVieImageProduit {
  stockage: PortStockageImageProduit
  registre: PortRegistreBrouillonImageProduit
  horloge: Horloge
}

export function creerCycleVieImageProduit(
  dependances: DependancesCycleVieImageProduit
): CycleVieImageProduit {
  const { stockage, registre, horloge } = dependances

  async function demanderBrouillon(
    input: DemandeBrouillonImageProduit
  ): Promise<ResultatDemandeBrouillonImageProduit> {
    const metadataInvalide = validerMetadata(input)
    if (metadataInvalide) return metadataInvalide

    const draftId = randomUUID()
    const expiresAt = dateDExpiration(horloge.maintenant())
    let upload: ResultatStockageImageProduit<{
      uploadUrl: string
      previewUrl: string
    }>
    try {
      upload = await stockage.presignerBrouillon({
        draftId,
        contentType: input.contentType,
        size: input.size,
      })
    } catch {
      return refus(
        "stockage-indisponible",
        "Stockage Cloudflare R2 indisponible"
      )
    }
    if (!upload.ok) return refusStockage(upload)

    try {
      await registre.creer({
        id: draftId,
        ownerId: input.ownerId,
        contentType: input.contentType,
        byteSize: input.size,
        expiresAt,
      })
    } catch {
      return refus(
        "registre-indisponible",
        "Registre des Brouillons indisponible"
      )
    }

    return {
      ok: true,
      draftId,
      uploadUrl: upload.valeur.uploadUrl,
      previewUrl: upload.valeur.previewUrl,
      expiresAt,
    }
  }

  async function relacherBrouillon(input: {
    draftId: string
    ownerId: string
  }): Promise<ResultatRelacherBrouillonImageProduit> {
    const draft = await registre.lire(input.draftId)
    if (!draft) return refus("brouillon-introuvable", "Brouillon introuvable")
    if (draft.ownerId !== input.ownerId) {
      return refus(
        "proprietaire-incorrect",
        "Ce brouillon ne vous appartient pas"
      )
    }

    const now = horloge.maintenant()
    if (now >= draft.expiresAt) {
      return refus("brouillon-expire", MESSAGE_BROUILLON_EXPIRE)
    }
    if (draft.state !== "vivant") {
      return refus("brouillon-non-vivant", "Ce brouillon n'est pas vivant")
    }

    let suppression: ResultatStockageImageProduit<null>
    try {
      suppression = await stockage.supprimerBrouillon({
        draftId: draft.id,
        contentType: draft.mimeType,
      })
    } catch {
      return refus("stockage-refuse", "Échec de la libération du brouillon")
    }
    if (!suppression.ok) return refusStockage(suppression)

    try {
      const marked = await registre.marquerLibere({
        id: draft.id,
        ownerId: input.ownerId,
      })
      if (!marked) {
        return refus("brouillon-non-vivant", "Ce brouillon n'est pas vivant")
      }
    } catch {
      return refus(
        "registre-indisponible",
        "Registre des Brouillons indisponible"
      )
    }

    return { ok: true, draftId: draft.id }
  }

  async function revendiquerEtEnregistrer<TResult>(input: {
    tentativeId: string
    ownerId: string
    draftIds: readonly string[]
    enregistrer: EnregistrerCatalogue<TResult>
  }): Promise<ResultatRevendiquerEtEnregistrer<TResult>> {
    if (!input.tentativeId.trim() || !input.ownerId.trim()) {
      return refus(
        "identifiant-proprietaire-invalide",
        "Tentative d'édition ou propriétaire invalide"
      )
    }
    const draftIds = [...new Set(input.draftIds)]
    if (draftIds.length === 0) {
      return refus("revendication-refusee", "Aucun Brouillon à revendiquer")
    }

    const claimed: BrouillonImageProduit[] = []
    for (const id of draftIds) {
      let result: ResultatRevendicationRegistre
      try {
        result = await registre.revendiquer({
          id,
          ownerId: input.ownerId,
          tentativeId: input.tentativeId,
          now: horloge.maintenant(),
        })
      } catch {
        return refus(
          "registre-indisponible",
          "Registre des Brouillons indisponible"
        )
      }
      if (!result.ok) {
        await Promise.all(
          claimed.map((draft) =>
            registre
              .annulerRevendication({
                id: draft.id,
                tentativeId: input.tentativeId,
              })
              .catch(() => undefined)
          )
        )
        return resultatRegistreRefus(result)
      }
      claimed.push(result.value)
    }

    const promoted: ImageProduitPromue[] = []
    for (const draft of claimed) {
      let result: ResultatStockageImageProduit<{ publicUrl: string }>
      try {
        result = await stockage.promouvoirBrouillon({
          draftId: draft.id,
          contentType: draft.mimeType,
        })
      } catch {
        result = {
          ok: false,
          erreur: {
            code: "erreur-stockage",
            message: "Échec de la promotion du Brouillon",
          },
        }
      }
      if (!result.ok) {
        await Promise.all(
          promoted.map((image) =>
            stockage
              .supprimerImagePromue({
                draftId: image.draftId,
                contentType:
                  claimed.find((draft) => draft.id === image.draftId)
                    ?.mimeType ?? "",
              })
              .catch(() => undefined)
          )
        )
        await Promise.all(
          claimed.map((draft) =>
            registre
              .annulerRevendication({
                id: draft.id,
                tentativeId: input.tentativeId,
              })
              .catch(() => undefined)
          )
        )
        return refusStockage(result)
      }
      promoted.push({ draftId: draft.id, publicUrl: result.valeur.publicUrl })
    }

    let persisted: ResultatEnregistrementCatalogue<TResult>
    try {
      persisted = await input.enregistrer(promoted)
    } catch {
      await Promise.all(
        promoted.map((image) =>
          stockage
            .supprimerImagePromue({
              draftId: image.draftId,
              contentType:
                claimed.find((draft) => draft.id === image.draftId)?.mimeType ??
                "",
            })
            .catch(() => undefined)
        )
      )
      await Promise.all(
        claimed.map((draft) =>
          registre
            .annulerRevendication({
              id: draft.id,
              tentativeId: input.tentativeId,
            })
            .catch(() => undefined)
        )
      )
      return refus("catalogue-refuse", "L'enregistrement du Catalogue a échoué")
    }

    for (const draft of claimed) {
      const image = promoted.find((candidate) => candidate.draftId === draft.id)
      if (!image) continue
      try {
        const confirmed = await registre.confirmerPromotion({
          id: draft.id,
          tentativeId: input.tentativeId,
          productId: persisted.productId,
          publicUrl: image.publicUrl,
        })
        if (!confirmed) {
          return refus(
            "revendication-refusee",
            "Le Brouillon n'a pas pu être associé au Produit"
          )
        }
      } catch {
        return refus(
          "registre-indisponible",
          "Registre des Brouillons indisponible"
        )
      }
    }

    return {
      ok: true,
      productId: persisted.productId,
      result: persisted.result,
      images: promoted,
    }
  }

  return {
    demanderBrouillon,
    relacherBrouillon,
    revendiquerEtEnregistrer,
    lireBrouillon: (id) => registre.lire(id),
  }
}

const cycleVieImageProduitParDefaut = creerCycleVieImageProduit({
  stockage: stockageImageProduitR2,
  registre: registreBrouillonImageProduitPrisma,
  horloge: horlogeSysteme,
})

export default cycleVieImageProduitParDefaut
