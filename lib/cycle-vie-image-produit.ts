import "server-only"

import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
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

export interface ConfirmationPromotionBrouillonImageProduit {
  id: string
  tentativeId: string
  productId: string
  publicUrl: string
}

export interface PortTransactionRegistreBrouillonImageProduit {
  confirmerPromotion(
    input: ConfirmationPromotionBrouillonImageProduit
  ): Promise<boolean>
}

export type LierBrouillonsImageProduit = (
  productId: string,
  transaction?: PortTransactionRegistreBrouillonImageProduit
) => Promise<void>

export interface ResultatEnregistrementCatalogue<TResult> {
  productId: string
  result: TResult
}

export type EnregistrerCatalogue<TResult> = (
  images: readonly ImageProduitPromue[],
  lier: LierBrouillonsImageProduit
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
    resultatDejaPersiste?: (productId: string) => Promise<TResult>
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

/**
 * « n'est pas vivant » ne dit rien à l'éditeur : un Brouillon déjà libéré
 * n'a qu'à disparaître de la galerie, un Brouillon déjà revendiqué appartient
 * désormais à un Produit et ne peut plus être retiré.
 */
function raisonNonVivant(draft: BrouillonImageProduit): string {
  if (draft.state === "libéré") {
    return "Ce Brouillon d'Image produit a déjà été libéré"
  }
  if (draft.state === "revendiqué") {
    return "Ce Brouillon d'Image produit a déjà été revendiqué : il appartient maintenant à un Produit et ne peut plus être libéré"
  }
  return "Ce Brouillon d'Image produit n'est pas vivant"
}

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

type TransactionBrouillonImageProduit = Pick<
  Prisma.TransactionClient,
  "brouillonImageProduit"
>

async function confirmerPromotionAvecTransaction(
  transaction: TransactionBrouillonImageProduit,
  input: ConfirmationPromotionBrouillonImageProduit
): Promise<boolean> {
  const updated = await transaction.brouillonImageProduit.updateMany({
    where: {
      id: input.id,
      tentativeId: input.tentativeId,
      state: "revendiqué",
      OR: [
        { productId: null, promotedPublicUrl: null },
        { productId: null, promotedPublicUrl: input.publicUrl },
        {
          productId: input.productId,
          promotedPublicUrl: input.publicUrl,
        },
      ],
    },
    data: {
      productId: input.productId,
      promotedPublicUrl: input.publicUrl,
    },
  })
  if (updated.count === 1) return true

  const row = await transaction.brouillonImageProduit.findUnique({
    where: { id: input.id },
    select: selectionBrouillon,
  })
  return Boolean(
    row &&
    row.state === "revendiqué" &&
    row.tentativeId === input.tentativeId &&
    row.productId === input.productId &&
    row.promotedPublicUrl === input.publicUrl
  )
}

export function portTransactionRegistreBrouillonImageProduit(
  transaction: TransactionBrouillonImageProduit
): PortTransactionRegistreBrouillonImageProduit {
  return {
    confirmerPromotion: (input) =>
      confirmerPromotionAvecTransaction(transaction, input),
  }
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
      const lire = () =>
        prisma.brouillonImageProduit.findUnique({
          where: { id: input.id },
          select: selectionBrouillon,
        })

      let row = await lire()
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
      if (row.state === "revendiqué" && row.tentativeId === input.tentativeId) {
        return { ok: true, value: versBrouillon(row) }
      }

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
        row = await lire()
        if (row) return { ok: true, value: versBrouillon(row) }
      }

      row = await lire()
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
      if (row.state === "revendiqué" && row.tentativeId === input.tentativeId) {
        return { ok: true, value: versBrouillon(row) }
      }
      return {
        ok: false,
        code: row.state === "revendiqué" ? "deja-revendique" : "non-vivant",
        message:
          row.state === "revendiqué"
            ? "Ce brouillon a déjà été revendiqué"
            : "Ce brouillon n'est pas vivant",
      }
    },

    async confirmerPromotion(input) {
      return confirmerPromotionAvecTransaction(prisma, input)
    },

    async annulerRevendication(input) {
      await prisma.brouillonImageProduit.updateMany({
        where: {
          id: input.id,
          tentativeId: input.tentativeId,
          productId: null,
        },
        data: {
          state: "vivant",
          tentativeId: null,
          promotedPublicUrl: null,
        },
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
    const messageSuppressionImpossible =
      "Le Brouillon d'Image produit a été libéré, mais son objet n'a pas pu être supprimé du stockage pour le moment. Il sera récupéré automatiquement par la règle de cycle de vie R2."
    let draft: BrouillonImageProduit | null
    try {
      draft = await registre.lire(input.draftId)
    } catch {
      return refus(
        "registre-indisponible",
        "Registre des Brouillons indisponible"
      )
    }
    if (!draft) {
      return refus(
        "brouillon-introuvable",
        "Brouillon d'Image produit introuvable"
      )
    }
    if (draft.ownerId !== input.ownerId) {
      return refus(
        "proprietaire-incorrect",
        "Ce Brouillon d'Image produit ne vous appartient pas"
      )
    }

    const now = horloge.maintenant()
    if (now >= draft.expiresAt) {
      return refus("brouillon-expire", MESSAGE_BROUILLON_EXPIRE)
    }
    if (draft.state !== "vivant") {
      return refus("brouillon-non-vivant", raisonNonVivant(draft))
    }

    /**
     * La libération est terminale : marquer d'abord le Brouillon d'Image
     * produit empêche de revendiquer un objet absent. Si la suppression échoue
     * ensuite, l'orphelin reste dans l'espace réservé `products/brouillons/`
     * et sera récupéré par la règle de cycle de vie R2 ; aucun second nettoyage
     * n'est ajouté ici.
     */
    try {
      const marked = await registre.marquerLibere({
        id: draft.id,
        ownerId: input.ownerId,
      })
      if (!marked) {
        const relu = await registre.lire(input.draftId).catch(() => null)
        return refus(
          "brouillon-non-vivant",
          relu ? raisonNonVivant(relu) : raisonNonVivant(draft)
        )
      }
    } catch {
      return refus(
        "registre-indisponible",
        "Registre des Brouillons indisponible"
      )
    }

    let suppression: ResultatStockageImageProduit<null>
    try {
      suppression = await stockage.supprimerBrouillon({
        draftId: draft.id,
        contentType: draft.mimeType,
      })
    } catch {
      return refus("stockage-refuse", messageSuppressionImpossible)
    }
    if (!suppression.ok) {
      return refus(
        suppression.erreur.code === "non-configure"
          ? "stockage-indisponible"
          : "stockage-refuse",
        messageSuppressionImpossible
      )
    }

    return { ok: true, draftId: draft.id }
  }

  async function revendiquerEtEnregistrer<TResult>(input: {
    tentativeId: string
    ownerId: string
    draftIds: readonly string[]
    enregistrer: EnregistrerCatalogue<TResult>
    resultatDejaPersiste?: (productId: string) => Promise<TResult>
  }): Promise<ResultatRevendiquerEtEnregistrer<TResult>> {
    const tentativeId = input.tentativeId.trim()
    const ownerId = input.ownerId.trim()
    if (!tentativeId || !ownerId) {
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
    const mimeParBrouillon = new Map<string, string>()
    const now = horloge.maintenant()

    async function restaurerRevendications(): Promise<void> {
      await Promise.all(
        claimed.map((draft) =>
          registre
            .annulerRevendication({
              id: draft.id,
              tentativeId,
            })
            .catch(() => undefined)
        )
      )
    }

    for (const id of draftIds) {
      let result: ResultatRevendicationRegistre
      try {
        result = await registre.revendiquer({
          id,
          ownerId,
          tentativeId,
          now,
        })
      } catch {
        await restaurerRevendications()
        return refus(
          "registre-indisponible",
          "Registre des Brouillons indisponible"
        )
      }
      if (!result.ok) {
        await restaurerRevendications()
        return resultatRegistreRefus(result)
      }
      claimed.push(result.value)
      mimeParBrouillon.set(result.value.id, result.value.mimeType)
    }

    const brouillonsLies = claimed.filter(
      (
        draft
      ): draft is BrouillonImageProduit & {
        productId: string
        promotedPublicUrl: string
      } => draft.productId !== null && draft.promotedPublicUrl !== null
    )
    if (brouillonsLies.length > 0) {
      const productIds = new Set(brouillonsLies.map((draft) => draft.productId))
      if (brouillonsLies.length !== claimed.length || productIds.size !== 1) {
        await restaurerRevendications()
        return refus(
          "revendication-refusee",
          "Les Brouillons ne sont pas tous liés à la même tentative"
        )
      }
      if (input.resultatDejaPersiste) {
        const productId = [...productIds][0]
        try {
          const result = await input.resultatDejaPersiste(productId)
          return {
            ok: true,
            productId,
            result,
            images: brouillonsLies.map((draft) => ({
              draftId: draft.id,
              publicUrl: draft.promotedPublicUrl,
            })),
          }
        } catch {
          return refus(
            "catalogue-refuse",
            "L'enregistrement du Catalogue a échoué"
          )
        }
      }
    }

    async function supprimerPromotions(
      images: readonly ImageProduitPromue[]
    ): Promise<void> {
      await Promise.all(
        images.map((image) =>
          stockage
            .supprimerImagePromue({
              draftId: image.draftId,
              contentType: mimeParBrouillon.get(image.draftId) ?? "",
            })
            .catch(() => undefined)
        )
      )
    }

    const promoted: ImageProduitPromue[] = []
    const nouvellesPromotions: ImageProduitPromue[] = []
    for (const draft of claimed) {
      if (draft.promotedPublicUrl) {
        const image = {
          draftId: draft.id,
          publicUrl: draft.promotedPublicUrl,
        }
        promoted.push(image)
        if (draft.productId === null) nouvellesPromotions.push(image)
        continue
      }

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
        await supprimerPromotions(nouvellesPromotions)
        await restaurerRevendications()
        return refusStockage(result)
      }

      const image = { draftId: draft.id, publicUrl: result.valeur.publicUrl }
      promoted.push(image)
      nouvellesPromotions.push(image)
    }

    const lier: LierBrouillonsImageProduit = async (productId, transaction) => {
      for (const image of promoted) {
        const confirmation = {
          id: image.draftId,
          tentativeId,
          productId,
          publicUrl: image.publicUrl,
        }
        const confirmed = transaction
          ? await transaction.confirmerPromotion(confirmation)
          : await registre.confirmerPromotion(confirmation)
        if (!confirmed) {
          throw new Error("Le Brouillon n'a pas pu être associé au Produit")
        }
      }
    }

    let persisted: ResultatEnregistrementCatalogue<TResult>
    try {
      persisted = await input.enregistrer(promoted, lier)
    } catch {
      await supprimerPromotions(nouvellesPromotions)
      await restaurerRevendications()
      return refus("catalogue-refuse", "L'enregistrement du Catalogue a échoué")
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
