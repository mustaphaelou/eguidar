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
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

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

/**
 * La traduction HTTP du vocabulaire de refus, au même endroit que ce
 * vocabulaire. Le type de la table est l'union des codes : un code ajouté sans
 * statut est une erreur de compilation, jamais un 500 silencieux que rien ne
 * signale — et aucune route n'a plus sa propre copie, partielle donc fausse
 * dès qu'un code bouge.
 *
 * Un refus de l'éditeur se lit par lui : 400 pour ce qu'il a mal soumis, 403
 * pour ce qui n'est pas à lui, 404 pour ce qui n'existe plus, 409 et 410 pour
 * un état qui ne se reprendra pas, 502 et 503 pour une dépendance en panne.
 */
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
 * Rétention initiale d'un Brouillon d'Image produit abandonné, en heures. C'est
 * la valeur de repli : la rétention effective est lue dans l'environnement,
 * voir `retentionBrouillonImageProduitHeures`.
 */
export const RETENTION_BROUILLON_IMAGE_PRODUIT_H_PAR_DEFAUT = 24

/**
 * La rétention effective, en heures, lue dans l'unique variable
 * d'environnement qui la porte (ADR-0004). C'est la seule lecture : la règle de
 * cycle de vie R2 en dérive ses jours, donc l'application et la règle
 * d'expiration ne peuvent pas diverger.
 */
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

/**
 * Refus honnête : au-delà de la rétention, l'objet peut déjà avoir été
 * supprimé par la règle de cycle de vie R2, donc la seule issue est un
 * nouveau téléversement. Aucun nettoyage n'est tenté ici.
 */
const MESSAGE_BROUILLON_EXPIRE =
  "Ce Brouillon d'Image produit a expiré et son fichier peut déjà avoir été supprimé du stockage. Téléversez à nouveau l'image."

const MESSAGE_BROUILLON_DEJA_LIBERE =
  "Ce Brouillon d'Image produit a déjà été libéré : il n'existe plus et ne peut plus être revendiqué."

const MESSAGE_CONFLIT_REVENDICATION =
  "Ce Brouillon d'Image produit est déjà utilisé par une autre tentative d'enregistrement. Rechargez le formulaire ou retirez-le de la galerie."

/**
 * Un registre indisponible n'est pas un refus métier : la rétention du
 * Brouillon n'est pas en jeu, seul l'enregistrement durable est momentanément
 * hors service. Le message est donc unique, et ne promet aucune reprise.
 */
const MESSAGE_REGISTRE_INDISPONIBLE = "Registre des Brouillons indisponible"

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
    case "deja-revendique":
      return refus("brouillon-non-vivant", MESSAGE_CONFLIT_REVENDICATION)
    case "deja-libere":
      return refus("brouillon-non-vivant", MESSAGE_BROUILLON_DEJA_LIBERE)
    case "non-vivant":
      return refus("brouillon-non-vivant", resultat.message)
  }
}

/** La ligne du registre, telle que Prisma la rend : `state` n'y est pas typé. */
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
 * Un Brouillon d'Image produit dont la rétention est dépassée et qui n'est lié à
 * aucun Produit se résout en `expiré`, dans l'état de revendication qu'il ait.
 *
 * La compensation d'une revendication échouée est best-effort : un Brouillon
 * peut rester `revendiqué` avec un `tentativeId` et aucun `productId`. Il
 * refuse alors toute autre tentative — à juste titre, aucune double
 * revendication — mais resterait invisible comme expiré, alors que la
 * rétention est écoulée (histoire 25 de l'issue #406).
 *
 * `libéré` reste terminal : l'éditeur a été prévenu et l'objet supprimé.
 * `expiré` l'est déjà. Un Brouillon lié à un Produit est une Image produit
 * persistée : il n'est jamais réétiqueté.
 */
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

/**
 * Ce qu'une lecture de la ligne décide de la revendication : soit la ligne
 * tranche, soit elle laisse la comparaison-and-échange écrire. L'état d'une
 * ligne qui laisse écrire est renvoyé avec elle, parce qu'il décide du refus
 * que l'appelant rendra si l'écriture échoue.
 */
type VerdictRevendication =
  | { kind: "tranche"; resultat: ResultatRevendicationRegistre }
  | { kind: "a_ecrire"; row: LigneBrouillonImageProduit }

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

  /**
   * L'échelle de refus de la revendication, dans un seul ordre. La
   * comparaison-and-échange se lit deux fois — avant d'écrire, puis après, pour
   * savoir qui a gagné — et les deux lectures doivent appliquer exactement les
   * mêmes refus : une évolution de la propriété ou de l'expiration ne peut
   * atterrir que dans l'une des deux. `a_ecrire` est le seul cas que la
   * première lecture laisse passer à l'écriture ; l'état de la ligne y décide
   * encore, c'est donc à l'appelant d'en tirer le refus après l'écriture.
   */
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
    // La rétention limite une nouvelle revendication, pas la résolution
    // d'une tentative déjà gagnée.
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

      // L'écriture a échoué : la ligne a bougé entre-temps, on relit pour
      // savoir qui a gagné. Aucun des refus précédents ne s'appliquant, c'est
      // que la ligne n'a pas bougé — une relecture n'y changerait rien.
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
        return refus("registre-indisponible", MESSAGE_REGISTRE_INDISPONIBLE)
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
          // Le commit est déjà durable (les Brouillons sont liés) : on
          // profite du retry pour achever une libération best-effort manquée.
          await libererSources()
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

    // La promotion est une copie : une fois le commit Catalogue écrit, la
    // source du Brouillon (`products/brouillons/`) ne sert plus à personne.
    // On ne la libère qu'après ce commit, en best-effort, et jamais sur un
    // chemin de compensation — le Brouillon y doit rester revendicable.
    // Un 404 (déjà nettoyé) ou une panne transitoire ne remet pas pour autant
    // l'enregistrement en cause ; la règle de cycle de vie R2 couvre le reste.
    async function libererSources(): Promise<void> {
      await Promise.all(
        draftIds.map(async (draftId) => {
          try {
            await stockage.supprimerBrouillon({
              draftId,
              contentType: mimeParBrouillon.get(draftId) ?? "",
            })
          } catch {
            // Best-effort : déjà nettoyé (404) ou panne transitoire.
          }
        })
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

    let enregistre: ResultatEnregistrementCatalogue<TResult>
    try {
      enregistre = await input.enregistrer(promoted, lier)
    } catch (error) {
      // La compensation est obligatoire, le message l'est aussi : une erreur
      // du Catalogue destinée à l'éditeur (slug en conflit, SKU dupliqué,
      // galerie invalide) garde son message sur ce chemin comme sur celui qui
      // n'a pas de Brouillon. Une erreur ordinaire reste générique.
      await supprimerPromotions(nouvellesPromotions)
      await restaurerRevendications()
      return refus(
        "catalogue-refuse",
        error instanceof UserFacingError
          ? error.message
          : "L'enregistrement du Catalogue a échoué"
      )
    }

    // Le commit Catalogue est écrit : la source du Brouillon est libérée ici,
    // une seule fois, sur ce chemin de réussite seulement — jamais pendant
    // une compensation (cf. `libererSources`).
    await libererSources()

    return {
      ok: true,
      productId: enregistre.productId,
      result: enregistre.result,
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
