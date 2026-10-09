import "server-only"

import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type { Prisma } from "@/lib/generated/prisma/client"
import {
  isContentTypeImageProduit,
  MAX_UPLOAD_SIZE,
  draftObjectKey,
  stockageImageProduitR2,
  type ContentTypeImageProduit,
  type PortStockageImageProduit,
  type ResultatStockageImageProduit,
} from "@/lib/r2"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export type {
  ContentTypeImageProduit,
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
  mimeType: ContentTypeImageProduit
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

export const STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT: Record<
  CodeRefusCycleVieImageProduit,
  number
> = {
  "identifiant-proprietaire-invalide": 400,
  "metadata-invalide": 400,
  "mime-non-autorise": 400,
  "taille-invalide": 400,
  "trop-volumineux": 400,
  "stockage-indisponible": 503,
  "stockage-refuse": 502,
  "registre-indisponible": 500,
  "brouillon-introuvable": 404,
  "proprietaire-incorrect": 403,
  "brouillon-non-vivant": 409,
  "brouillon-expire": 410,
  "revendication-refusee": 409,
  "catalogue-refuse": 409,
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

interface ImageProduitPromue {
  draftId: string
  publicUrl: string
  contentType: ContentTypeImageProduit
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

export interface FaitsRevendicationImagesProduit {
  readonly galerie: readonly string[]
  readonly promues: readonly string[]
  readonly lier: LierBrouillonsImageProduit
}

export class RevendicationImagesProduit {
  readonly galerie: readonly string[]
  readonly promues: readonly string[]
  readonly lier: LierBrouillonsImageProduit
  private readonly porte: true

  private constructor(faits: FaitsRevendicationImagesProduit) {
    this.galerie = [...faits.galerie]
    this.promues = [...faits.promues]
    this.lier = faits.lier
    this.porte = true
  }

  static creer(
    faits: FaitsRevendicationImagesProduit
  ): RevendicationImagesProduit {
    return new RevendicationImagesProduit(faits)
  }
}

export type EnregistrerCatalogue = (
  revendication: RevendicationImagesProduit
) => Promise<{ productId: string }>

export type ResultatRevendiquerEtEnregistrer =
  { ok: true; productId: string } | RefusCycleVieImageProduit

export interface Horloge {
  maintenant(): Date
}

export interface EntreeCreationBrouillonImageProduit {
  id: string
  ownerId: string
  contentType: ContentTypeImageProduit
  byteSize: number
  expiresAt: Date
}

export type CodeRefusRegistreBrouillon =
  | "introuvable"
  | "proprietaire-incorrect"
  | "non-vivant"
  | "expire"
  | "deja-revendique"
  | "deja-libere"

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
  revendiquerEtEnregistrer(input: {
    tentativeId: string
    ownerId: string
    galerie: readonly EntreeImageProduit[]
    enregistrer: EnregistrerCatalogue
    resultatDejaPersiste?: (productId: string) => Promise<void>
  }): Promise<ResultatRevendiquerEtEnregistrer>
  lireBrouillon(id: string): Promise<BrouillonImageProduit | null>
}

export const RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT = 24

export function retentionBrouillonImageProduitHeures(): number {
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

const MESSAGE_BROUILLON_EXPIRE =
  "Ce Brouillon d'Image produit a expiré et son fichier peut déjà avoir été supprimé du stockage. Téléversez à nouveau l'image."

const MESSAGE_BROUILLON_DEJA_LIBERE =
  "Ce Brouillon d'Image produit a déjà été libéré : il n'existe plus et ne peut plus être revendiqué."

const MESSAGE_CONFLIT_REVENDICATION =
  "Ce Brouillon d'Image produit est déjà utilisé par une autre tentative d'enregistrement. Rechargez le formulaire ou retirez-le de la galerie."

const MESSAGE_REGISTRE_INDISPONIBLE = "Registre des Brouillons indisponible"

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

interface MetadataValide {
  ok: true
  contentType: ContentTypeImageProduit
}

function validerMetadata(
  input: DemandeBrouillonImageProduit
): RefusCycleVieImageProduit | MetadataValide {
  if (typeof input.ownerId !== "string" || !input.ownerId.trim()) {
    return refus(
      "identifiant-proprietaire-invalide",
      "Identifiant de propriétaire invalide"
    )
  }
  if (!isContentTypeImageProduit(input.contentType)) {
    return refus("mime-non-autorise", "Type de fichier non pris en charge")
  }
  if (!Number.isInteger(input.size) || input.size <= 0) {
    return refus("taille-invalide", "Taille de fichier invalide")
  }
  if (input.size > MAX_UPLOAD_SIZE) {
    return refus("trop-volumineux", "Fichier trop volumineux (10 Mo maximum)")
  }
  return { ok: true, contentType: input.contentType }
}

function dateDExpiration(now: Date): Date {
  return new Date(
    now.getTime() + retentionBrouillonImageProduitHeures() * 60 * 60 * 1000
  )
}

function brouillonsDeLaGalerie(
  galerie: readonly EntreeImageProduit[]
): string[] {
  return [
    ...new Set(
      galerie.flatMap((entree) =>
        entree.kind === "brouillon" ? [entree.draftId] : []
      )
    ),
  ]
}

function galerieOrdonnee(
  galerie: readonly EntreeImageProduit[],
  urlParBrouillon: ReadonlyMap<string, string>
): string[] {
  return galerie.map((entree) => {
    if (entree.kind === "persistee") return entree.url
    const publicUrl = urlParBrouillon.get(entree.draftId)
    if (publicUrl === undefined) {
      throw new Error("URL d'Image produit promue indisponible")
    }
    return publicUrl
  })
}

function imagePromue(
  draft: BrouillonImageProduit,
  publicUrl: string
): ImageProduitPromue {
  return {
    draftId: draft.id,
    publicUrl,
    contentType: draft.mimeType,
  }
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
    case "deja-revendique":
      return refus("brouillon-non-vivant", MESSAGE_CONFLIT_REVENDICATION)
    case "deja-libere":
      return refus("brouillon-non-vivant", MESSAGE_BROUILLON_DEJA_LIBERE)
    case "non-vivant":
      return refus("brouillon-non-vivant", resultat.message)
  }
}

type LigneBrouillonImageProduit = {
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
}

function versBrouillon(row: LigneBrouillonImageProduit): BrouillonImageProduit {
  if (!isContentTypeImageProduit(row.mimeType)) {
    throw new Error(
      `Type de fichier illisible dans le registre des Brouillons : ${row.mimeType}`
    )
  }
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

function estResolubleEnExpire(
  row: { state: string; expiresAt: Date; productId: string | null },
  now: Date
): boolean {
  return (
    row.productId === null &&
    row.expiresAt <= now &&
    (row.state === "vivant" || row.state === "revendiqué")
  )
}

function refusNonVivant(state: string): {
  ok: false
  code: CodeRefusRegistreBrouillon
  message: string
} {
  return {
    ok: false,
    code:
      state === "revendiqué"
        ? "deja-revendique"
        : state === "libéré"
          ? "deja-libere"
          : "non-vivant",
    message: "Ce brouillon n'est pas vivant",
  }
}

type VerdictRevendication =
  | { kind: "tranche"; resultat: ResultatRevendicationRegistre }
  | { kind: "a_ecrire"; row: LigneBrouillonImageProduit }

export function creerRegistreBrouillonImageProduitPrisma(
  horloge: Horloge
): PortRegistreBrouillonImageProduit {
  async function marquerExpire(id: string, now: Date): Promise<void> {
    try {
      await prisma.brouillonImageProduit.updateMany({
        where: {
          id,
          productId: null,
          state: { in: ["vivant", "revendiqué"] },
          expiresAt: { lte: now },
        },
        data: { state: "expiré" },
      })
    } catch (error) {
      console.warn(
        `[brouillon-image-produit] état expiré non écrit pour ${id}`,
        error
      )
    }
  }

  async function classer(
    row: LigneBrouillonImageProduit | null,
    input: { id: string; ownerId: string; tentativeId: string; now: Date }
  ): Promise<VerdictRevendication> {
    if (!row) {
      return {
        kind: "tranche",
        resultat: {
          ok: false,
          code: "introuvable",
          message: "Brouillon introuvable",
        },
      }
    }
    if (row.ownerId !== input.ownerId) {
      return {
        kind: "tranche",
        resultat: {
          ok: false,
          code: "proprietaire-incorrect",
          message: "Ce brouillon ne vous appartient pas",
        },
      }
    }
    if (row.state === "revendiqué" && row.tentativeId === input.tentativeId) {
      return {
        kind: "tranche",
        resultat: { ok: true, value: versBrouillon(row) },
      }
    }
    if (row.expiresAt <= input.now) {
      await marquerExpire(input.id, input.now)
      return {
        kind: "tranche",
        resultat: {
          ok: false,
          code: "expire",
          message: "Brouillon expiré",
        },
      }
    }
    return { kind: "a_ecrire", row }
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
      if (estResolubleEnExpire(row, now)) {
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

      const avant = await classer(await lire(), input)
      if (avant.kind === "tranche") return avant.resultat

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
        const gagne = await lire()
        if (gagne) return { ok: true, value: versBrouillon(gagne) }
      }

      const apres = await classer(await lire(), input)
      return apres.kind === "tranche"
        ? apres.resultat
        : refusNonVivant(apres.row.state)
    },

    async confirmerPromotion(input) {
      return confirmerPromotionAvecTransaction(prisma, input)
    },

    async annulerRevendication(input) {
      await prisma.brouillonImageProduit.updateMany({
        where: {
          id: input.id,
          tentativeId: input.tentativeId,
          state: "revendiqué",
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
    const metadata = validerMetadata(input)
    if (!metadata.ok) return metadata
    const { contentType } = metadata

    const draftId = randomUUID()
    const expiresAt = dateDExpiration(horloge.maintenant())
    let upload: ResultatStockageImageProduit<{
      uploadUrl: string
      previewUrl: string
    }>
    try {
      upload = await stockage.presignerBrouillon({
        draftId,
        contentType,
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
        contentType,
        byteSize: input.size,
        expiresAt,
      })
    } catch {
      return refus("registre-indisponible", MESSAGE_REGISTRE_INDISPONIBLE)
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
      return refus("registre-indisponible", MESSAGE_REGISTRE_INDISPONIBLE)
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
      return refus("registre-indisponible", MESSAGE_REGISTRE_INDISPONIBLE)
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

  async function revendiquerEtEnregistrer(input: {
    tentativeId: string
    ownerId: string
    galerie: readonly EntreeImageProduit[]
    enregistrer: EnregistrerCatalogue
    resultatDejaPersiste?: (productId: string) => Promise<void>
  }): Promise<ResultatRevendiquerEtEnregistrer> {
    const tentativeId = input.tentativeId.trim()
    const ownerId = input.ownerId.trim()
    if (!tentativeId || !ownerId) {
      return refus(
        "identifiant-proprietaire-invalide",
        "Tentative d'édition ou propriétaire invalide"
      )
    }
    const draftIds = brouillonsDeLaGalerie(input.galerie)

    const revendiques: BrouillonImageProduit[] = []
    const now = horloge.maintenant()

    async function restaurerRevendications(): Promise<void> {
      await Promise.all(
        revendiques.map((draft) =>
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
        return refus("registre-indisponible", MESSAGE_REGISTRE_INDISPONIBLE)
      }
      if (!result.ok) {
        await restaurerRevendications()
        return resultatRegistreRefus(result)
      }
      revendiques.push(result.value)
    }

    const brouillonsLies = revendiques.filter(
      (
        draft
      ): draft is BrouillonImageProduit & {
        productId: string
        promotedPublicUrl: string
      } => draft.productId !== null && draft.promotedPublicUrl !== null
    )
    if (brouillonsLies.length > 0) {
      const productIds = new Set(brouillonsLies.map((draft) => draft.productId))
      if (
        brouillonsLies.length !== revendiques.length ||
        productIds.size !== 1
      ) {
        await restaurerRevendications()
        return refus(
          "revendication-refusee",
          "Les Brouillons ne sont pas tous liés à la même tentative"
        )
      }
      if (input.resultatDejaPersiste) {
        const productId = [...productIds][0]
        try {
          await input.resultatDejaPersiste(productId)
          await libererSources()
          return { ok: true, productId }
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
              contentType: image.contentType,
            })
            .catch(() => undefined)
        )
      )
    }

    async function libererSources(): Promise<void> {
      await Promise.all(
        revendiques.map(async (brouillon) => {
          try {
            await stockage.supprimerBrouillon({
              draftId: brouillon.id,
              contentType: brouillon.mimeType,
            })
          } catch {}
        })
      )
    }

    const promues: ImageProduitPromue[] = []
    const nouvellesPromotions: ImageProduitPromue[] = []
    for (const draft of revendiques) {
      if (draft.promotedPublicUrl) {
        const image = imagePromue(draft, draft.promotedPublicUrl)
        promues.push(image)
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

      const image = imagePromue(draft, result.valeur.publicUrl)
      promues.push(image)
      nouvellesPromotions.push(image)
    }

    const lier: LierBrouillonsImageProduit = async (productId, transaction) => {
      for (const image of promues) {
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

    let enregistre: Awaited<ReturnType<EnregistrerCatalogue>>
    try {
      const revendication = RevendicationImagesProduit.creer({
        galerie: galerieOrdonnee(
          input.galerie,
          new Map(promues.map((image) => [image.draftId, image.publicUrl]))
        ),
        promues: promues.map((image) => image.publicUrl),
        lier,
      })
      enregistre = await input.enregistrer(revendication)
    } catch (error) {
      await supprimerPromotions(nouvellesPromotions)
      await restaurerRevendications()
      return refus(
        "catalogue-refuse",
        error instanceof UserFacingError
          ? error.message
          : "L'enregistrement du Catalogue a échoué"
      )
    }

    await libererSources()

    return { ok: true, productId: enregistre.productId }
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
