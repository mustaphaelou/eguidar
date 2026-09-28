import "server-only"

import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
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

/**
 * L'URL publique qu'une promotion a produite, et le Brouillon dont elle
 * vient. Elle ne sort plus de ce module : le résultat de l'opération ne rend
 * plus la liste des Images produit promues (ticket #458), et aucun appelant de
 * production ne l'a jamais lue.
 */
interface ImageProduitPromue {
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

/**
 * Les trois faits qu'une revendication tient prête à forward ensemble : la
 * Galerie produit qu'elle a composée, dans l'ordre de l'Administration, le
 * sous-ensemble qu'elle a promu, et la liaison à exécuter dans la transaction
 * du Catalogue. Aucun ne se passe sans les deux autres.
 */
export interface FaitsRevendicationImagesProduit {
  readonly galerie: readonly string[]
  readonly promues: readonly string[]
  readonly lier: LierBrouillonsImageProduit
}

/**
 * La valeur qu'une revendication tient prête à forward, et que le Catalogue
 * reçoit en un seul morceau.
 *
 * **Les trois faits vont ensemble.** Les URL promues sont ce qui autorise une
 * Image produit nouvelle à être écrite : une liaison sans elles se ferait
 * refuser la galerie, et une galerie sans promotion ne lierait rien. Cette
 * valeur n'a donc pas de constructeur public et porte une marque : la seule
 * façon de l'obtenir est la porte, qui exige les trois faits. Un appelant ne
 * peut plus passer la liaison et le sous-ensemble promu séparément, ni les
 * fabriquer de son côté.
 */
export class RevendicationImagesProduit {
  /** La Galerie produit dans l'ordre de l'Administration. */
  readonly galerie: readonly string[]
  /** Le sous-ensemble que cette même opération a promu. */
  readonly promues: readonly string[]
  /** La liaison à exécuter dans la transaction du Catalogue. */
  readonly lier: LierBrouillonsImageProduit
  /**
   * La marque de la porte : elle rend la valeur non reproductible ailleurs,
   * donc impossible à fabriquer à la main au lieu de passer par
   * `creerRevendicationImagesProduit`. Le constructeur est privé, et cette
   * propriété n'est attribuable qu'à cette classe — un objet écrit à la main,
   * même complet, n'est donc pas une `RevendicationImagesProduit`.
   */
  private readonly porte: true

  private constructor(faits: FaitsRevendicationImagesProduit) {
    this.galerie = [...faits.galerie]
    this.promues = [...faits.promues]
    this.lier = faits.lier
    this.porte = true
  }

  /**
   * La seule porte de construction : elle exige les trois faits ensemble — la
   * Galerie ordonnée, le sous-ensemble promu et la liaison. Un objet
   * `{ lier, promues }` écrit à la main n'est donc pas une revendication, et le
   * compilateur le dit à la construction.
   *
   * Elle est statique parce que le constructeur est privé : c'est cette porte,
   * et elle seule, qui peut l'appeler.
   */
  static creer(
    faits: FaitsRevendicationImagesProduit
  ): RevendicationImagesProduit {
    return new RevendicationImagesProduit(faits)
  }
}

/**
 * La porte, nommée comme la valeur qu'elle rend : c'est la seule façon d'obtenir
 * une `RevendicationImagesProduit`.
 */
export const creerRevendicationImagesProduit = RevendicationImagesProduit.creer

/**
 * La façon dont l'appelant écrit le Catalogue, une fois la revendication
 * décidée.
 *
 * **Elle reçoit la valeur, pas des faits à recomposer.** Le découpage de la
 * galerie, le réassemblage de l'ordre de l'éditeur et le sous-ensemble promu
 * sont faits ici, une fois pour toutes ; l'appelant n'a donc plus qu'une chose à
 * dire : voici comment le Catalogue s'écrit. Il forward la valeur telle quelle,
 * sans la relire, la compléter ni la refaire.
 *
 * **Elle rend le seul fait dont l'opération a besoin : l'identifiant du Produit
 * écrit.** Elle ne rend pas la valeur que sa mutation rend — la rangée, la
 * projection, ce que l'appelant voudra — parce que le cycle de vie n'en lit
 * aucune. Un résultat générique instancié `unknown` aux deux sites d'appel et
 * jeté aux deux n'annonçait qu'une lecture qui n'avait lieu nulle part. Une
 * valeur nommée plutôt qu'une chaîne nue, parce que le fait rendu est un
 * *Produit enregistré* et non un identifiant : si l'écriture demande un jour le
 * nom de l'URL de sa page, la forme s'y prêtera sans que l'interface change
 * encore.
 */
export type EnregistrerCatalogue = (
  revendication: RevendicationImagesProduit
) => Promise<{ productId: string }>

/**
 * Ce que l'appelant reçoit de l'opération : un fait — le Produit écrit, par
 * son identifiant — ou un refus. Rien d'autre.
 *
 * **La Galerie produit enregistrée ne se rend pas ici.** Elle est écrite, et se
 * lit dans la rangée du Catalogue ; l'état d'un Brouillon se lit dans le
 * registre. Les rendre dans le résultat les ferait annoncer par l'opération
 * une vérité qu'elle ne connaît qu'après l'écriture, à quelqu'un qui la lit
 * déjà à sa source — et ferait de ce rendu une deuxième déclaration de ce qui
 * est déjà durable.
 */
export type ResultatRevendiquerEtEnregistrer =
  { ok: true; productId: string } | RefusCycleVieImageProduit

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
  /**
   * Enregistrer un Produit, en代人ant la Galerie produit qu'il porte.
   *
   * **L'opération prend la galerie entière, dans l'ordre de l'éditeur, et
   * possède cet ordre.** Elle rend la main à l'appelant sur un fait simple :
   * l'ordre dans lequel l'éditeur a arrangé sa galerie est l'ordre dans lequel
   * elle sera enregistrée, un Brouillon intercalé entre deux Images produit
   * persistées atterrissant entre elles. Le découpage de la galerie en Images
   * produit déjà persistées et Brouillons à revendiquer, le réassemblage de la
   * liste ordonnée d'URL une fois les Brouillons promus, et le sous-ensemble
   * promu qui autorise leur écriture sont écrits ici, dans ce module, et nulle
   * part ailleurs : changer la façon dont une galerie s'enregistre est une
   * seule édition.
   *
   * **Une seule opération, pas deux.** Le cycle de vie n'apprend rien du
   * Catalogue : il ne le connaît pas, et il n'a pas à savoir si la mutation
   * qui écrit est une création ou une mise à jour. C'est l'appelant qui choisit
   * laquelle écrire, en fournissant `enregistrer`. La liaison y reste une
   * fonction qu'il fournit, parce que le Catalogue atteint déjà ce module —
   * l'appeler ici serait un cycle d'import.
   *
   * **Une galerie sans Brouillon prend ce chemin-là aussi.** Il n'y a rien à
   * revendiquer, donc rien à promouvoir et rien à lier : la galerie part telle
   * quelle, le sous-ensemble promu est vide, et c'est le Catalogue qui décide de
   * ce qu'il accepte d'en écrire. Une telle galerie est un cas légal, jamais un
   * refus — et une opération de plus qui mériterait son propre chemin n'existe
   * plus, donc plus rien à se souvenir d'appeler d'abord.
   *
   * **Elle rend un fait et un refus, rien de plus.** L'appelant a besoin de
   * savoir quel Produit a été écrit, pour le rediriger vers lui ; il n'a besoin
   * de rien d'autre, et l'opération n'a rien d'autre à dire. Un résultat qu'il
   * jetterait, une liste d'Images promues qu'il ne lirait pas, seraient une
   * interface qui annonce des lectures à venir — et une obligation de les
   * garder justes.
   */
  revendiquerEtEnregistrer(input: {
    tentativeId: string
    ownerId: string
    /** La Galerie produit soumise, entière, dans l'ordre de l'éditeur. */
    galerie: readonly EntreeImageProduit[]
    enregistrer: EnregistrerCatalogue
    /**
     * La relecture du commit déjà durable, qu'un retry de la même tentative
     * fournit. Elle ne rend rien : elle échoue si le commit n'existe pas, et
     * c'est de là que vient le refus « catalogue-refuse » de ce chemin. Elle
     * n'est jamais lue, donc elle ne rend pas davantage.
     */
    resultatDejaPersiste?: (productId: string) => Promise<void>
  }): Promise<ResultatRevendiquerEtEnregistrer>
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

/**
 * **Le découpage de la Galerie produit.** Les Brouillons à revendiquer, dans
 * l'ordre de l'éditeur, sans doublon. Les Images produit déjà persistées n'en
 * font pas partie : elles ne sont ni à revendiquer ni à promouvoir, et ce que
 * le Catalogue accepte d'en écrire reste sa propre décision.
 *
 * Une liste vide n'est donc pas un refus, c'est une galerie dont cette opération
 * n'a rien à faire avant d'écrire le Catalogue.
 */
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

/**
 * **Le réassemblage de l'ordre.** La liste d'URL que le Catalogue va écrire,
 * dans l'ordre exact des entrées soumises, chaque Brouillon prenant la place de
 * l'URL publique que sa promotion vient de produire. C'est ici qu'un Brouillon
 * intercalé entre deux Images produit persistées atterrit entre elles.
 *
 * Une URL absente ne peut pas survenir : chaque Brouillon de la galerie a été
 * revendiqué et promu avant que cette liste soit demandée, et chaque promotion
 * répond une URL. Son absence est donc une invariante rompue, pas une donnée
 * d'entrée — et le dire ici, plutôt que de rendre une galerie plus courte que
 * celle que l'éditeur a arrangée, vaut mieux qu'un silence.
 */
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

    /**
     * La compensation ne rend `vivant` que ce qui est encore `revendiqué` : un
     * Brouillon dont la rétention est échue a été résolu en `expiré`, et le
     * rendre à `vivant` le rendrait revendicable alors que son objet a pu être
     * supprimé par la règle de cycle de vie R2. Le port en mémoire applique la
     * même précondition, et le contrat exige que les deux s'accordent.
     */
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
    // Le découpage est ici, et l'ordre de l'éditeur est conservé : la galerie
    // reste la référence, cette liste n'en est qu'une lecture pour le registre.
    // Elle peut être vide — une galerie déjà entièrement persistée n'a rien à
    // revendiquer — et cela ne refuse rien : il n'y a simplement aucun Brouillon
    // à prendre avant d'écrire le Catalogue.
    const draftIds = brouillonsDeLaGalerie(input.galerie)

    const revendiques: BrouillonImageProduit[] = []
    const mimeParBrouillon = new Map<string, string>()
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
      mimeParBrouillon.set(result.value.id, result.value.mimeType)
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
        // Le seul refus qui porte encore ce code : la galerie mêle des
        // Brouillons qu'une tentative a déjà liés à un Produit et d'autres qui
        // ne le sont pas. Rien à voir avec « aucun Brouillon à revendiquer »,
        // qui a disparu : une galerie sans Brouillon n'est pas un refus.
        return refus(
          "revendication-refusee",
          "Les Brouillons ne sont pas tous liés à la même tentative"
        )
      }
      if (input.resultatDejaPersiste) {
        const productId = [...productIds][0]
        try {
          // La relecture ne rend rien : ce qu'elle prouve, c'est que le commit
          // existe, et son échec est le refus d'après.
          await input.resultatDejaPersiste(productId)
          // Le commit est déjà durable (les Brouillons sont liés) : on
          // profite du retry pour achever une libération best-effort manquée.
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

    const promues: ImageProduitPromue[] = []
    const nouvellesPromotions: ImageProduitPromue[] = []
    for (const draft of revendiques) {
      if (draft.promotedPublicUrl) {
        const image = {
          draftId: draft.id,
          publicUrl: draft.promotedPublicUrl,
        }
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

      const image = { draftId: draft.id, publicUrl: result.valeur.publicUrl }
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
      // La valeur est tendue, pas expliquée : l'appelant forward la galerie
      // qu'elle porte et la liaison qu'elle contient, sans rien recomposer. Le
      // réassemblage est dans le même `try` que l'appel au Catalogue, pour que
      // son hypothèse — une URL pour chaque Brouillon — reste couverte par la
      // compensation comme le reste de ce chemin.
      const revendication = creerRevendicationImagesProduit({
        galerie: galerieOrdonnee(
          input.galerie,
          new Map(promues.map((image) => [image.draftId, image.publicUrl]))
        ),
        promues: promues.map((image) => image.publicUrl),
        lier,
      })
      enregistre = await input.enregistrer(revendication)
    } catch (error) {
      // La compensation est obligatoire, le message l'est aussi : une erreur
      // du Catalogue destinée à l'éditeur (slug en conflit, SKU dupliqué,
      // galerie invalide, règle de création) garde son message sur ce chemin
      // comme sur celui d'une galerie sans Brouillon, où il n'y a rien à
      // compenser. Une erreur ordinaire reste générique.
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

    // Le seul fait rendu est le Produit écrit. La galerie enregistrée se lit
    // dans la rangée du Catalogue et l'état des Brouillons dans le registre :
    // les rendre ici ferait dire deux fois la même chose, par une opération qui
    // ne les a pas lues à leur source.
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
