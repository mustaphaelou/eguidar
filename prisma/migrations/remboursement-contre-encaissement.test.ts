import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"

const PREFIXE = `remboursement-migration-${process.pid}-`
const DOSSIER_MIGRATIONS = join(process.cwd(), "prisma", "migrations")

function migrationDuRemboursement(): { dossier: string; sql: string } {
  const dossiers = readdirSync(DOSSIER_MIGRATIONS, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
    .sort()
  for (const dossier of dossiers) {
    const sql = readFileSync(
      join(DOSSIER_MIGRATIONS, dossier, "migration.sql"),
      "utf8"
    )
    if (sql.includes('CREATE TABLE "Refund"')) return { dossier, sql }
  }
  throw new Error("aucune migration ne crée la table Refund")
}

async function messageDeLErreur(
  action: () => Promise<unknown>
): Promise<string> {
  try {
    await action()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error("l'écriture aurait dû être refusée")
}

let userId: string
let orderId: string
let paymentId: string

beforeAll(async () => {
  const utilisateur = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${PREFIXE}@test.ma`,
      name: "Client migration Remboursement",
    },
  })
  userId = utilisateur.id
  const commande = await prisma.order.create({
    data: {
      userId,
      cityName: "Ville migration Remboursement",
      address: "12 Avenue Hassan II",
      phone: "+212 600 123 456",
      total: 10000,
      shippingFee: 0,
      totalPayable: 10000,
      status: "delivered",
      deliveredAt: new Date("2026-11-10T10:00:00.000Z"),
    },
  })
  orderId = commande.id
  const encaissement = await prisma.payment.create({
    data: {
      orderId,
      amount: 10000,
      mode: "cash_on_delivery",
      collectedAt: new Date("2026-11-10T10:00:00.000Z"),
      recordedById: userId,
    },
  })
  paymentId = encaissement.id
})

afterAll(async () => {
  await prisma.refund.deleteMany({
    where: { payment: { order: { id: orderId } } },
  })
  await prisma.return.deleteMany({ where: { orderId } })
  await prisma.payment.deleteMany({ where: { orderId } })
  await prisma.order.deleteMany({ where: { id: orderId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe("la migration du Remboursement", () => {
  it("est additive : elle ajoute l'énumération, la table, la clé et le CHECK", () => {
    const { dossier, sql } = migrationDuRemboursement()

    expect(dossier).toMatch(/^\d{14}_remboursement_[a-z0-9_]+$/)
    expect(sql).toContain(
      "CREATE TYPE \"RefundMode\" AS ENUM ('cash', 'transfer')"
    )
    expect(sql).toContain('CREATE TABLE "Refund"')
    expect(sql).toContain('CREATE UNIQUE INDEX "Refund_idempotencyKey_key"')
    expect(sql).toContain('CHECK ("amount" > 0)')
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|TYPE)/i)
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE|ALTER\s+COLUMN/i)
  })

  it("porte en base la clé d'idempotence unique, le CHECK et les actions des clés étrangères", async () => {
    const index = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'Refund_idempotencyKey_key'`
    )
    expect(index).toHaveLength(1)
    expect(index[0].indexdef).toContain("CREATE UNIQUE INDEX")

    const contraintes = await prisma.$queryRawUnsafe<
      { conname: string; definition: string; confdeltype: string }[]
    >(
      `SELECT conname, pg_get_constraintdef(oid) AS definition, confdeltype::text
         FROM pg_constraint
        WHERE conrelid = '"Refund"'::regclass
        ORDER BY conname`
    )
    const parNom = new Map(
      contraintes.map((contrainte) => [contrainte.conname, contrainte])
    )
    expect(parNom.get("Refund_amount_positive")?.definition).toContain(
      "CHECK ((amount > 0))"
    )
    expect(parNom.get("Refund_paymentId_fkey")?.confdeltype).toBe("c")
    expect(parNom.get("Refund_returnId_fkey")?.confdeltype).toBe("n")
    expect(parNom.get("Refund_recordedById_fkey")?.confdeltype).toBe("n")
  })

  it("refuse en base une clé d'idempotence réutilisée et un montant non positif", async () => {
    const autreEncaissement = await prisma.payment.create({
      data: {
        orderId,
        amount: 10000,
        mode: "cash_on_delivery",
        collectedAt: new Date("2026-11-10T11:00:00.000Z"),
        recordedById: userId,
      },
    })
    const cle = `${PREFIXE}-${randomUUID()}`
    await prisma.refund.create({
      data: {
        paymentId,
        amount: 1000,
        mode: "cash",
        refundedAt: new Date("2026-11-12T10:00:00.000Z"),
        recordedById: userId,
        idempotencyKey: cle,
      },
    })

    const doublon = await messageDeLErreur(() =>
      prisma.refund.create({
        data: {
          paymentId: autreEncaissement.id,
          amount: 1000,
          mode: "cash",
          refundedAt: new Date("2026-11-12T10:00:00.000Z"),
          recordedById: userId,
          idempotencyKey: cle,
        },
      })
    )
    expect(doublon).toContain("Refund_idempotencyKey_key")

    const negatif = await messageDeLErreur(() =>
      prisma.refund.create({
        data: {
          paymentId,
          amount: 0,
          mode: "cash",
          refundedAt: new Date("2026-11-12T10:00:00.000Z"),
          recordedById: userId,
          idempotencyKey: `${PREFIXE}-negatif-${randomUUID()}`,
        },
      })
    )
    expect(negatif).toContain("Refund_amount_positive")

    await prisma.payment.delete({ where: { id: autreEncaissement.id } })
  })

  it("efface le lien au Retour supprimé et emporte le Remboursement avec son Encaissement", async () => {
    const retour = await prisma.return.create({
      data: {
        orderId,
        reason: "withdrawal",
        requestedAt: new Date("2026-11-11T11:00:00.000Z"),
      },
    })
    const remboursement = await prisma.refund.create({
      data: {
        paymentId,
        returnId: retour.id,
        amount: 1000,
        mode: "transfer",
        refundedAt: new Date("2026-11-12T10:00:00.000Z"),
        recordedById: userId,
        idempotencyKey: `${PREFIXE}-cascade-${randomUUID()}`,
      },
    })

    await prisma.return.delete({ where: { id: retour.id } })
    const detache = await prisma.refund.findUniqueOrThrow({
      where: { id: remboursement.id },
    })
    expect(detache.returnId).toBeNull()

    await prisma.payment.delete({ where: { id: paymentId } })
    await expect(
      prisma.refund.findUnique({ where: { id: remboursement.id } })
    ).resolves.toBeNull()
  })
})
