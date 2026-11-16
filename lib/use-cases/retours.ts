import { z } from "zod"

import { prisma } from "@/lib/db"
import type {
  ReturnStatus,
  ReturnReason,
  ReturnRefusalCode,
} from "@/lib/generated/prisma/client"
import {
  CODES_REFUS_RETOUR,
  MOTIFS_RETOUR,
  motifEnregistre,
  type CodeRefusRetour,
  type MotifRetour,
} from "@/lib/retours"
import { messageDeValidation } from "@/lib/use-cases/mutation-squelette"
import { uniqueViolationIndex } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

/**
 * Le nom de l'index partiel qui porte « au plus une demande ouverte par
 * Commande ». Prisma ne décode pas les index partiels : la violation se
 * reconnaît par ce nom, que la migration `retour_declaration_et_refus` écrit.
 */
const INDEX_DEMANDE_OUVERTE = "Return_orderId_ouvert_key"

export interface LigneDeclaree {
  orderItemId: string
  declaredQuantity: number
}

export interface DeclarationDeRetour {
  orderId: string
  reason: MotifRetour
  /** La date à laquelle le Client a exercé son droit, distincte de la saisie. */
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

/**
 * Déclare un Retour : ses lignes et leurs quantités déclarées. Le verrou de la
 * Commande sérialise deux déclarations concurrentes, et le cumul des quantités
 * déclarées — tous Retours non refusés confondus — ne dépasse jamais la
 * quantité commandée. L'index partiel porte la règle « au plus une demande
 * ouverte par Commande ». Ni le stock ni le Statut de commande ne changent.
 */
export async function declarerRetour(
  input: DeclarationDeRetour
): Promise<RetourCree> {
  const declaration = parseDeclaration(input)
  const orderItemIds = declaration.lines.map((ligne) => ligne.orderItemId)

  try {
    return await prisma.$transaction(async (tx) => {
      const verrou = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Order" WHERE id = ${declaration.orderId} FOR UPDATE
      `
      if (verrou.length === 0) throw new CommandeDuRetourIntrouvableError()

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

/**
 * Refuse une demande ouverte avec un code légal et une note. Le refus est une
 * écriture de la seule ligne du Retour : il ne supprime ni la demande, ni ses
 * lignes, ni aucun Remboursement déjà accordé, et il ne touche ni au stock ni
 * au Statut de commande.
 */
export async function refuserRetour(input: RefusDeRetour): Promise<RetourCree> {
  const refus = parseRefus(input)

  return await prisma.$transaction(async (tx) => {
    const existant = await tx.return.findUnique({
      where: { id: refus.returnId },
      select: { id: true },
    })
    if (!existant) throw new RetourIntrouvableError()

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
