import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"

const PREFIXE = `retour-migration-${process.pid}-`
const DOSSIER_MIGRATIONS = join(process.cwd(), "prisma", "migrations")

function migrationDuRetour(): { dossier: string; sql: string } {
  const dossiers = readdirSync(DOSSIER_MIGRATIONS, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
  for (const dossier of dossiers) {
    const sql = readFileSync(
      join(DOSSIER_MIGRATIONS, dossier, "migration.sql"),
      "utf8"
    )
    if (sql.includes('CREATE TABLE "Return"')) return { dossier, sql }
  }
  throw new Error("aucune migration ne crée la table Return")
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

beforeAll(async () => {
  const utilisateur = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${PREFIXE}@test.ma`,
      name: "Client migration Retour",
    },
  })
  userId = utilisateur.id
})

afterAll(async () => {
  await prisma.returnLine.deleteMany({
    where: { return: { order: { user: { email: `${PREFIXE}@test.ma` } } } },
  })
  await prisma.return.deleteMany({
    where: { order: { user: { email: `${PREFIXE}@test.ma` } } },
  })
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email: `${PREFIXE}@test.ma` } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email: `${PREFIXE}@test.ma` } },
  })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

async function creerCommande() {
  return prisma.order.create({
    data: {
      userId,
      cityName: "Ville migration Retour",
      address: "12 Avenue Hassan II",
      phone: "+212 600 123 456",
      total: 10000,
      shippingFee: 0,
      totalPayable: 10000,
      status: "delivered",
      deliveredAt: new Date("2026-11-10T10:00:00.000Z"),
      items: {
        create: [
          {
            productName: "Article migration",
            variantName: "Standard",
            price: 10000,
            quantity: 3,
          },
        ],
      },
    },
    include: { items: true },
  })
}

async function creerRetour(
  orderId: string,
  statut: "requested" | "received" | "refused" = "requested"
): Promise<string> {
  const id = randomUUID()
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Return"
       ("id", "orderId", "status", "reason", "requestedAt", "updatedAt")
     VALUES ($1, $2, $3::"ReturnStatus", 'withdrawal', now(), now())`,
    id,
    orderId,
    statut
  )
  return id
}

async function insererLigne(
  returnId: string,
  orderItemId: string,
  declaredQuantity: number,
  receivedQuantity: number | null = null
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ReturnLine"
       ("id", "returnId", "orderItemId", "declaredQuantity", "receivedQuantity", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, now())`,
    randomUUID(),
    returnId,
    orderItemId,
    declaredQuantity,
    receivedQuantity
  )
}

describe("la migration du Retour", () => {
  it("est additive : elle ajoute la date de livraison, les tables et les énumérations", () => {
    const { dossier, sql } = migrationDuRetour()

    expect(dossier).toMatch(/^\d{14}_retour_[a-z0-9_]+$/)
    expect(sql).toContain(
      'ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMPTZ(3)'
    )
    expect(sql).toContain('CREATE TYPE "ReturnStatus" AS ENUM')
    expect(sql).toContain('CREATE TYPE "ReturnReason" AS ENUM')
    expect(sql).toContain('CREATE TYPE "ReturnRefusalCode" AS ENUM')
    expect(sql).toContain('CREATE TYPE "ReturnLineCondition" AS ENUM')
    expect(sql).toContain('CREATE TABLE "Return"')
    expect(sql).toContain('CREATE TABLE "ReturnLine"')
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|TYPE)/i)
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE|ALTER\s+COLUMN/i)
  })

  it("porte l'index partiel des demandes ouvertes et les deux CHECK de quantité", async () => {
    const index = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'Return_orderId_ouvert_key'`
    )
    expect(index).toHaveLength(1)
    expect(index[0].indexdef).toContain("CREATE UNIQUE INDEX")
    expect(index[0].indexdef).toContain(
      `WHERE (status = 'requested'::"ReturnStatus")`
    )

    const contraintes = await prisma.$queryRawUnsafe<
      { conname: string; definition: string }[]
    >(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = '"ReturnLine"'::regclass AND contype = 'c'
        ORDER BY conname`
    )
    const parNom = new Map(
      contraintes.map((contrainte) => [
        contrainte.conname,
        contrainte.definition,
      ])
    )
    expect([...parNom.keys()]).toEqual([
      "ReturnLine_declaredQuantity_positive",
      "ReturnLine_receivedQuantity_bornee",
    ])
    expect(parNom.get("ReturnLine_declaredQuantity_positive")).toContain(
      '"declaredQuantity" > 0'
    )
    const bornes = parNom.get("ReturnLine_receivedQuantity_bornee") ?? ""
    expect(bornes).toContain('"receivedQuantity" >= 0')
    expect(bornes).toContain('"receivedQuantity" <= "declaredQuantity"')
  })

  it("refuse en base une quantité déclarée nulle ou une réception hors bornes", async () => {
    const commande = await creerCommande()
    const retour = await creerRetour(commande.id)
    const article = commande.items[0]

    const nulle = await messageDeLErreur(() =>
      insererLigne(retour, article.id, 0)
    )
    expect(nulle).toContain("ReturnLine_declaredQuantity_positive")

    const horsBornes = await messageDeLErreur(() =>
      insererLigne(retour, article.id, 1, 2)
    )
    expect(horsBornes).toContain("ReturnLine_receivedQuantity_bornee")
  })

  it("refuse en base une seconde demande ouverte pour la même Commande", async () => {
    const commande = await creerCommande()
    await creerRetour(commande.id)

    const doublon = await messageDeLErreur(() => creerRetour(commande.id))
    expect(doublon).toContain("Return_orderId_ouvert_key")
  })
})
