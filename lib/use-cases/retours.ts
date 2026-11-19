import { z } from "zod"

import { declarerApresEcriture, type PlanCommande } from "@/lib/apres-ecriture"
import { enregistrerFaits } from "@/lib/automations/evenements"
import { prisma } from "@/lib/db"
import type {
  ReturnStatus,
  ReturnReason,
  ReturnRefusalCode,
} from "@/lib/generated/prisma/client"
import {
  CODES_REFUS_RETOUR,
  ETATS_LIGNE_RETOUR,
  MOTIFS_RETOUR,
  motifEnregistre,
  toutesLesUnitesSontRevenues,
  type CodeRefusRetour,
  type EtatLigneRetour,
  type MotifRetour,
  type QuantiteCommandee,
} from "@/lib/retours"
import { peutCloreParRetour } from "@/lib/statut-de-commande"
import { executer as executerCommande } from "@/lib/use-cases/apres-ecriture/commande"
import {
  avecSurchargesCommande,
  écrireLeStock,
  exécuterStock,
  InvalidOrderTransitionError,
  reapprovisionner,
  toOrderEmailSnapshot,
  verrouillerCommande,
  type MouvementDeStock,
  type SurchargesCommande,
} from "@/lib/use-cases/commande-stock"
import { messageDeValidation } from "@/lib/use-cases/mutation-squelette"
import { uniqueViolationIndex } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const INDEX_DEMANDE_OUVERTE = "Return_orderId_ouvert_key"

export interface LigneDeclaree {
  orderItemId: string
  declaredQuantity: number
}

export interface DeclarationDeRetour {
  orderId: string
  reason: MotifRetour
  requestedAt: Date
  lines: LigneDeclaree[]
}

export interface LigneDuRetourCreee {
  orderItemId: string
  declaredQuantity: number
}

export interface RetourCree {
  id: string
  orderId: string
  status: ReturnStatus
  reason: MotifRetour
  requestedAt: Date
  receivedAt: Date | null
  refusalCode: ReturnRefusalCode | null
  refusalNote: string | null
  lines: LigneDuRetourCreee[]
}

export interface RefusDeRetour {
  returnId: string
  code: CodeRefusRetour
  note?: string
}

export interface LigneRecue {
  orderItemId: string
  receivedQuantity: number
  condition: EtatLigneRetour | null
}

export interface ReceptionDeRetour {
  returnId: string
  lines: LigneRecue[]
  actorId: string
}

export interface LigneDuRetourRecue extends LigneDuRetourCreee {
  receivedQuantity: number
  condition: EtatLigneRetour | null
}

export interface RetourRecu {
  id: string
  orderId: string
  status: ReturnStatus
  reason: MotifRetour
  requestedAt: Date
  receivedAt: Date
  lines: LigneDuRetourRecue[]
  commandeClose: boolean
}

export class RetourValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "RetourValidationError"
  }
}

export class CommandeDuRetourIntrouvableError extends UserFacingError {
  constructor() {
    super("Commande introuvable")
    this.name = "CommandeDuRetourIntrouvableError"
  }
}

export class DemandeDeRetourOuverteError extends UserFacingError {
  constructor() {
    super("Une demande de Retour est déjà ouverte pour cette Commande")
    this.name = "DemandeDeRetourOuverteError"
  }
}

export class PlafondDuRetourDepasseError extends UserFacingError {
  constructor({
    article,
    commandee,
    dejaDeclaree,
    demandee,
  }: {
    article: string
    commandee: number
    dejaDeclaree: number
    demandee: number
  }) {
    super(
      `Quantité déclarée au-delà du plafond pour « ${article} » : ${demandee} demandée(s), ${dejaDeclaree} déjà déclarée(s), ${commandee} commandée(s)`
    )
    this.name = "PlafondDuRetourDepasseError"
  }
}

export class RetourIntrouvableError extends UserFacingError {
  constructor() {
    super("Retour introuvable")
    this.name = "RetourIntrouvableError"
  }
}

export class RefusDeRetourImpossibleError extends UserFacingError {
  constructor() {
    super("Seule une demande ouverte peut être refusée")
    this.name = "RefusDeRetourImpossibleError"
  }
}

export class ReceptionDeRetourImpossibleError extends UserFacingError {
  constructor() {
    super("Seule une demande de Retour ouverte peut être reçue")
    this.name = "ReceptionDeRetourImpossibleError"
  }
}

export class DepassementDeLaQuantiteDeclareeError extends UserFacingError {
  constructor({
    article,
    declaree,
    recue,
  }: {
    article: string
    declaree: number
    recue: number
  }) {
    super(
      `Quantité reçue au-delà de la déclarée pour « ${article} » : ${recue} reçue(s), ${declaree} déclarée(s)`
    )
    this.name = "DepassementDeLaQuantiteDeclareeError"
  }
}

const ligneDeclareeSchema = z.object({
  orderItemId: z.string().min(1, "Article du panier requis"),
  declaredQuantity: z
    .number()
    .int("quantité déclarée en entier")
    .positive("quantité déclarée strictement positive"),
})

const declarationSchema = z
  .object({
    orderId: z.string().min(1, "Commande requise"),
    reason: z.enum(MOTIFS_RETOUR),
    requestedAt: z.date("date de demande invalide"),
    lines: z.array(ligneDeclareeSchema).min(1, "au moins une Ligne du Retour"),
  })
  .superRefine((declaration, contexte) => {
    const vus = new Set<string>()
    for (const ligne of declaration.lines) {
      if (vus.has(ligne.orderItemId)) {
        contexte.addIssue({
          code: "custom",
          path: ["lines"],
          message: "un Article du panier ne peut apparaître qu'une fois",
        })
        return
      }
      vus.add(ligne.orderItemId)
    }
  })

const refusSchema = z.object({
  returnId: z.string().min(1, "Retour requis"),
  code: z.enum(CODES_REFUS_RETOUR),
  note: z.string().trim().optional(),
})

const ligneRecueSchema = z
  .object({
    orderItemId: z.string().min(1, "Article du panier requis"),
    receivedQuantity: z
      .number()
      .int("quantité reçue en entier")
      .min(0, "quantité reçue positive ou nulle"),
    condition: z.enum(ETATS_LIGNE_RETOUR).nullable(),
  })
  .superRefine((ligne, contexte) => {
    if (ligne.receivedQuantity > 0 && ligne.condition === null) {
      contexte.addIssue({
        code: "custom",
        path: ["condition"],
        message: "l'état de la Ligne du Retour reçue est requis",
      })
    }
    if (ligne.receivedQuantity === 0 && ligne.condition !== null) {
      contexte.addIssue({
        code: "custom",
        path: ["condition"],
        message: "une Ligne du Retour sans unité reçue ne porte pas d'état",
      })
    }
  })

const receptionSchema = z
  .object({
    returnId: z.string().min(1, "Retour requis"),
    lines: z.array(ligneRecueSchema).min(1, "au moins une Ligne du Retour"),
    actorId: z.string().min(1, "administrateur acteur requis"),
  })
  .superRefine((reception, contexte) => {
    const vus = new Set<string>()
    for (const ligne of reception.lines) {
      if (vus.has(ligne.orderItemId)) {
        contexte.addIssue({
          code: "custom",
          path: ["lines"],
          message: "un Article du panier ne peut apparaître qu'une fois",
        })
        return
      }
      vus.add(ligne.orderItemId)
    }
  })

function parseDeclaration(input: DeclarationDeRetour): DeclarationDeRetour {
  const result = declarationSchema.safeParse(input)
  if (!result.success) {
    throw new RetourValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function parseRefus(input: RefusDeRetour): RefusDeRetour {
  const result = refusSchema.safeParse(input)
  if (!result.success) {
    throw new RetourValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function parseReception(input: ReceptionDeRetour): ReceptionDeRetour {
  const result = receptionSchema.safeParse(input)
  if (!result.success) {
    throw new RetourValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function toRetourCree(retour: {
  id: string
  orderId: string
  status: ReturnStatus
  reason: ReturnReason
  requestedAt: Date
  receivedAt: Date | null
  refusalCode: ReturnRefusalCode | null
  refusalNote: string | null
  lines: { orderItemId: string; declaredQuantity: number }[]
}): RetourCree {
  return {
    id: retour.id,
    orderId: retour.orderId,
    status: retour.status,
    reason: retour.reason,
    requestedAt: retour.requestedAt,
    receivedAt: retour.receivedAt,
    refusalCode: retour.refusalCode,
    refusalNote: retour.refusalNote,
    lines: retour.lines.map((ligne) => ({
      orderItemId: ligne.orderItemId,
      declaredQuantity: ligne.declaredQuantity,
    })),
  }
}

export async function declarerRetour(
  input: DeclarationDeRetour
): Promise<RetourCree> {
  const declaration = parseDeclaration(input)
  const orderItemIds = declaration.lines.map((ligne) => ligne.orderItemId)

  try {
    return await prisma.$transaction(async (tx) => {
      const existe = await verrouillerCommande(tx, declaration.orderId)
      if (!existe) throw new CommandeDuRetourIntrouvableError()

      const commande = await tx.order.findUniqueOrThrow({
        where: { id: declaration.orderId },
        include: { items: true },
      })

      const articles = new Map(
        commande.items.map((article) => [article.id, article])
      )
      const lignes = declaration.lines.map((ligne) => {
        const article = articles.get(ligne.orderItemId)
        if (!article) {
          throw new RetourValidationError([
            "Article du panier inconnu dans cette Commande",
          ])
        }
        return { ligne, article }
      })

      const cumuls = await tx.returnLine.groupBy({
        by: ["orderItemId"],
        where: {
          orderItemId: { in: orderItemIds },
          return: { status: { not: "refused" } },
        },
        _sum: { declaredQuantity: true },
      })
      const dejaDeclarees = new Map(
        cumuls.map((cumul) => [
          cumul.orderItemId,
          cumul._sum.declaredQuantity ?? 0,
        ])
      )

      for (const { ligne, article } of lignes) {
        const dejaDeclaree = dejaDeclarees.get(ligne.orderItemId) ?? 0
        if (dejaDeclaree + ligne.declaredQuantity > article.quantity) {
          throw new PlafondDuRetourDepasseError({
            article: `${article.productName} ${article.variantName}`.trim(),
            commandee: article.quantity,
            dejaDeclaree,
            demandee: ligne.declaredQuantity,
          })
        }
      }

      const reason = motifEnregistre({
        motif: declaration.reason,
        requestedAt: declaration.requestedAt,
        deliveredAt: commande.deliveredAt,
      })

      const retour = await tx.return.create({
        data: {
          orderId: declaration.orderId,
          reason,
          requestedAt: declaration.requestedAt,
          lines: {
            create: declaration.lines.map((ligne) => ({
              orderItemId: ligne.orderItemId,
              declaredQuantity: ligne.declaredQuantity,
            })),
          },
        },
        include: { lines: true },
      })

      return toRetourCree(retour)
    })
  } catch (error) {
    if (uniqueViolationIndex(error) === INDEX_DEMANDE_OUVERTE) {
      throw new DemandeDeRetourOuverteError()
    }
    throw error
  }
}

export async function refuserRetour(input: RefusDeRetour): Promise<RetourCree> {
  const refus = parseRefus(input)

  return await prisma.$transaction(async (tx) => {
    const existant = await tx.return.findUnique({
      where: { id: refus.returnId },
      select: { id: true, orderId: true },
    })
    if (!existant) throw new RetourIntrouvableError()

    const existe = await verrouillerCommande(tx, existant.orderId)
    if (!existe) throw new CommandeDuRetourIntrouvableError()

    const refusee = await tx.return.updateMany({
      where: { id: refus.returnId, status: "requested" },
      data: {
        status: "refused",
        refusalCode: refus.code,
        refusalNote: refus.note === "" ? null : (refus.note ?? null),
      },
    })
    if (refusee.count === 0) throw new RefusDeRetourImpossibleError()

    const retour = await tx.return.findUniqueOrThrow({
      where: { id: refus.returnId },
      include: { lines: true },
    })
    return toRetourCree(retour)
  })
}

export async function recevoirRetour(
  input: ReceptionDeRetour,
  surcharges?: SurchargesCommande
): Promise<RetourRecu> {
  const reception = parseReception(input)
  const effets = avecSurchargesCommande(surcharges)

  const { recu, ecriture, plan } = await prisma.$transaction(async (tx) => {
    const cible = await tx.return.findUnique({
      where: { id: reception.returnId },
      select: { orderId: true },
    })
    if (!cible) throw new RetourIntrouvableError()

    const existe = await verrouillerCommande(tx, cible.orderId)
    if (!existe) throw new RetourIntrouvableError()

    const retour = await tx.return.findUniqueOrThrow({
      where: { id: reception.returnId },
      include: { lines: true },
    })
    if (retour.status !== "requested") {
      throw new ReceptionDeRetourImpossibleError()
    }

    const commande = await tx.order.findUniqueOrThrow({
      where: { id: cible.orderId },
      include: { items: true, user: { select: { email: true } } },
    })
    const articles = new Map(
      commande.items.map((article) => [article.id, article])
    )
    const lignesDeclarees = new Map(
      retour.lines.map((ligne) => [ligne.orderItemId, ligne])
    )
    const lignesRecues = new Map(
      reception.lines.map((ligne) => [ligne.orderItemId, ligne])
    )

    const lignesARecevoir: LigneDuRetourRecue[] = []
    for (const ligne of retour.lines) {
      if (!lignesRecues.has(ligne.orderItemId)) {
        throw new RetourValidationError([
          "chaque Ligne du Retour doit être reçue",
        ])
      }
    }
    for (const ligne of reception.lines) {
      const declaree = lignesDeclarees.get(ligne.orderItemId)
      if (!declaree) {
        throw new RetourValidationError([
          "Article du panier inconnu dans ce Retour",
        ])
      }
      if (ligne.receivedQuantity > declaree.declaredQuantity) {
        const article = articles.get(ligne.orderItemId)
        throw new DepassementDeLaQuantiteDeclareeError({
          article: article
            ? `${article.productName} ${article.variantName}`.trim()
            : "cet Article",
          declaree: declaree.declaredQuantity,
          recue: ligne.receivedQuantity,
        })
      }
      lignesARecevoir.push({
        orderItemId: ligne.orderItemId,
        declaredQuantity: declaree.declaredQuantity,
        receivedQuantity: ligne.receivedQuantity,
        condition: ligne.condition,
      })
    }

    const maintenant = new Date()
    const recue = await tx.return.updateMany({
      where: { id: retour.id, status: "requested" },
      data: { status: "received", receivedAt: maintenant },
    })
    if (recue.count === 0) throw new ReceptionDeRetourImpossibleError()

    const mouvements: MouvementDeStock[] = []
    for (const ligne of lignesARecevoir) {
      await tx.returnLine.updateMany({
        where: { returnId: retour.id, orderItemId: ligne.orderItemId },
        data: {
          receivedQuantity: ligne.receivedQuantity,
          condition: ligne.condition,
        },
      })
      if (ligne.receivedQuantity === 0 || ligne.condition !== "resellable") {
        continue
      }
      const article = articles.get(ligne.orderItemId)
      if (!article?.variantId) continue
      mouvements.push(
        reapprovisionner(article.variantId, ligne.receivedQuantity)
      )
    }
    const ecriture = await écrireLeStock(tx, mouvements)

    const cumuls = await tx.returnLine.groupBy({
      by: ["orderItemId"],
      where: {
        return: { orderId: commande.id, status: { not: "refused" } },
      },
      _sum: { receivedQuantity: true },
    })
    const quantitesRecues = Object.fromEntries(
      cumuls.map((cumul) => [
        cumul.orderItemId,
        cumul._sum.receivedQuantity ?? 0,
      ])
    )
    const quantitesCommandees: QuantiteCommandee[] = commande.items.map(
      (article) => ({ orderItemId: article.id, quantity: article.quantity })
    )

    let planDeCloture: PlanCommande | null = null
    if (toutesLesUnitesSontRevenues(quantitesCommandees, quantitesRecues)) {
      if (!peutCloreParRetour(commande.status)) {
        throw new InvalidOrderTransitionError(commande.status, "returned")
      }
      const fermeture = await tx.order.updateMany({
        where: { id: commande.id, status: commande.status },
        data: { status: "returned" },
      })
      if (fermeture.count === 0) {
        throw new InvalidOrderTransitionError(commande.status, "returned")
      }
      await tx.orderStatusChange.create({
        data: {
          orderId: commande.id,
          fromStatus: commande.status,
          toStatus: "returned",
          changedAt: maintenant,
          actorId: reception.actorId,
        },
      })
      const commandeClosee = await tx.order.findUniqueOrThrow({
        where: { id: commande.id },
        include: { items: true },
      })
      planDeCloture = declarerApresEcriture("commande.statut.changee", {
        commandeId: commande.id,
        snapshot: toOrderEmailSnapshot(commandeClosee, commande.user.email),
        statut: "returned",
      })
      await enregistrerFaits(tx, planDeCloture.faits)
    }

    return {
      recu: {
        id: retour.id,
        orderId: commande.id,
        status: "received" as const,
        reason: retour.reason,
        requestedAt: retour.requestedAt,
        receivedAt: maintenant,
        lines: lignesARecevoir,
        commandeClose: planDeCloture !== null,
      },
      ecriture,
      plan: planDeCloture,
    }
  })

  await exécuterStock(ecriture, effets.stock)
  if (plan) await executerCommande(plan, effets.email)
  return recu
}
