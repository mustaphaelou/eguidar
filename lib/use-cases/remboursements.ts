import { z } from "zod"

import { prisma } from "@/lib/db"
import type { RefundMode, Prisma } from "@/lib/generated/prisma/client"
import {
  attenteDeRemboursement,
  MODES_REMBOURSEMENT,
  type ModeRemboursement,
} from "@/lib/remboursements"
import { messageDeValidation } from "@/lib/use-cases/mutation-squelette"
import {
  hasUniqueViolation,
  uniqueViolationIndex,
} from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const INDEX_CLE_IDEMPOTENCE = "Refund_idempotencyKey_key"

export interface DemandeDeRemboursement {
  paymentId: string
  returnId?: string
  amount: number
  mode: ModeRemboursement
  refundedAt: Date
  recordedById: string
  reason?: string
  idempotencyKey: string
}

export interface RemboursementCree {
  id: string
  paymentId: string
  returnId: string | null
  amount: number
  mode: RefundMode
  refundedAt: Date
  recordedById: string | null
  reason: string | null
  idempotencyKey: string
  montantAttendu: number | null
}

interface ArticleDuPanier {
  id: string
  price: number
  quantity: number
}

interface EncaissementRembourse {
  id: string
  orderId: string
  amount: number
  order: { items: ArticleDuPanier[] }
}

interface RemboursementEnregistre {
  id: string
  paymentId: string
  returnId: string | null
  amount: number
  mode: RefundMode
  refundedAt: Date
  recordedById: string | null
  reason: string | null
  idempotencyKey: string
}

export class RemboursementValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "RemboursementValidationError"
  }
}

export class EncaissementIntrouvableError extends UserFacingError {
  constructor() {
    super("Encaissement introuvable")
    this.name = "EncaissementIntrouvableError"
  }
}

export class RetourDuRemboursementIntrouvableError extends UserFacingError {
  constructor() {
    super("Retour introuvable")
    this.name = "RetourDuRemboursementIntrouvableError"
  }
}

export class RetourDUnAutreEncaissementError extends UserFacingError {
  constructor() {
    super("Le Retour n'appartient pas à la Commande de l'Encaissement")
    this.name = "RetourDUnAutreEncaissementError"
  }
}

export class PlafondDuRemboursementDepasseError extends UserFacingError {
  constructor({
    demandee,
    dejaRemboursee,
    encaissee,
  }: {
    demandee: number
    dejaRemboursee: number
    encaissee: number
  }) {
    super(
      `Plafond de l'Encaissement dépassé : ${demandee} demandé(s), ${dejaRemboursee} déjà remboursé(s), ${encaissee} encaissé(s)`
    )
    this.name = "PlafondDuRemboursementDepasseError"
  }
}

export class CleIdempotenceReutiliseeError extends UserFacingError {
  constructor() {
    super("Cette clé d'idempotence a déjà servi à un autre Remboursement")
    this.name = "CleIdempotenceReutiliseeError"
  }
}

const remboursementSchema = z.object({
  paymentId: z.string().min(1, "Encaissement requis"),
  returnId: z.string().min(1, "Retour invalide").optional(),
  amount: z
    .number()
    .int("montant en centimes entiers")
    .positive("montant strictement positif"),
  mode: z.enum(MODES_REMBOURSEMENT),
  refundedAt: z.date("date de remboursement invalide"),
  recordedById: z.string().min(1, "administrateur requis"),
  reason: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1, "clé d'idempotence requise"),
})

function parseDemande(input: DemandeDeRemboursement): DemandeDeRemboursement {
  const resultat = remboursementSchema.safeParse(input)
  if (!resultat.success) {
    throw new RemboursementValidationError(
      resultat.error.issues.map((issue) => issue.message)
    )
  }
  return {
    ...resultat.data,
    reason: resultat.data.reason === "" ? undefined : resultat.data.reason,
  }
}

function toRemboursementCree(
  remboursement: RemboursementEnregistre,
  montantAttendu: number | null
): RemboursementCree {
  return {
    id: remboursement.id,
    paymentId: remboursement.paymentId,
    returnId: remboursement.returnId,
    amount: remboursement.amount,
    mode: remboursement.mode,
    refundedAt: remboursement.refundedAt,
    recordedById: remboursement.recordedById,
    reason: remboursement.reason,
    idempotencyKey: remboursement.idempotencyKey,
    montantAttendu,
  }
}

async function attentePourRetour(
  tx: Prisma.TransactionClient,
  encaissement: EncaissementRembourse,
  returnId: string
): Promise<number> {
  const retour = await tx.return.findUnique({
    where: { id: returnId },
    include: { lines: true },
  })
  if (!retour) throw new RetourDuRemboursementIntrouvableError()
  if (retour.orderId !== encaissement.orderId) {
    throw new RetourDUnAutreEncaissementError()
  }

  return attenteDeRemboursement({
    montantEncaisse: encaissement.amount,
    articles: encaissement.order.items,
    lignesDeclarees: retour.lines,
  })
}

function memeDemande(
  enregistre: RemboursementEnregistre,
  demande: DemandeDeRemboursement
): boolean {
  return (
    enregistre.paymentId === demande.paymentId &&
    enregistre.amount === demande.amount &&
    enregistre.mode === demande.mode &&
    (enregistre.returnId ?? null) === (demande.returnId ?? null)
  )
}

export async function enregistrerRemboursement(
  input: DemandeDeRemboursement
): Promise<RemboursementCree> {
  const demande = parseDemande(input)

  try {
    return await prisma.$transaction(async (tx) => {
      const verrou = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Payment" WHERE id = ${demande.paymentId} FOR UPDATE
      `
      if (verrou.length === 0) throw new EncaissementIntrouvableError()

      const encaissement = await tx.payment.findUniqueOrThrow({
        where: { id: demande.paymentId },
        include: { order: { include: { items: true } } },
      })

      const existant = await tx.refund.findUnique({
        where: { idempotencyKey: demande.idempotencyKey },
      })
      if (existant) {
        if (!memeDemande(existant, demande)) {
          throw new CleIdempotenceReutiliseeError()
        }
        const attente = existant.returnId
          ? await attentePourRetour(tx, encaissement, existant.returnId)
          : null
        return toRemboursementCree(existant, attente)
      }

      const attente = demande.returnId
        ? await attentePourRetour(tx, encaissement, demande.returnId)
        : null

      const rembourses = await tx.refund.aggregate({
        where: { paymentId: encaissement.id },
        _sum: { amount: true },
      })
      const dejaRemboursee = rembourses._sum.amount ?? 0
      if (dejaRemboursee + demande.amount > encaissement.amount) {
        throw new PlafondDuRemboursementDepasseError({
          demandee: demande.amount,
          dejaRemboursee,
          encaissee: encaissement.amount,
        })
      }

      const remboursement = await tx.refund.create({
        data: {
          paymentId: demande.paymentId,
          returnId: demande.returnId ?? null,
          amount: demande.amount,
          mode: demande.mode,
          refundedAt: demande.refundedAt,
          recordedById: demande.recordedById,
          reason: demande.reason ?? null,
          idempotencyKey: demande.idempotencyKey,
        },
      })
      return toRemboursementCree(remboursement, attente)
    })
  } catch (error) {
    if (
      uniqueViolationIndex(error) === INDEX_CLE_IDEMPOTENCE ||
      hasUniqueViolation(error, ["idempotencyKey"])
    ) {
      throw new CleIdempotenceReutiliseeError()
    }
    throw error
  }
}
