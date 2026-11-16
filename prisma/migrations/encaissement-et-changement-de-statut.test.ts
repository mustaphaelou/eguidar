import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import type { OrderStatus } from "@/lib/generated/prisma/client"

const PREFIXE = `migration-encaissement-${process.pid}-`
const DOSSIER_MIGRATIONS = join(process.cwd(), "prisma", "migrations")
const MIGRATION = "20261116130000_encaissement_et_changement_de_statut"
const DEBUT_DU_BACKFILL = "-- backfill début"
const FIN_DU_BACKFILL = "-- backfill fin"

function lireLaMigration(): string {
  return readFileSync(
    join(DOSSIER_MIGRATIONS, MIGRATION, "migration.sql"),
    "utf8"
  )
}

/**
 * Le backfill est une seule instruction, délimitée dans la migration pour que
 * ce test l'exécute telle quelle, deux fois. Le texte figé est celui que
 * `prisma migrate deploy` rejoue.
 */
function lireLeBackfill(): string {
  const sql = lireLaMigration()
  const debut = sql.indexOf(DEBUT_DU_BACKFILL)
  const fin = sql.indexOf(FIN_DU_BACKFILL)
  if (debut === -1 || fin === -1 || fin < debut) {
    throw new Error("la migration ne délimite pas son bloc de backfill")
  }
  return sql
    .slice(debut + DEBUT_DU_BACKFILL.length, fin)
    .trim()
    .replace(/;$/, "")
}

async function creerCommande(
  userId: string,
  status: OrderStatus,
  totalPayable = 12_500
): Promise<string> {
  const commande = await prisma.order.create({
    data: {
      userId,
      cityName: "Ville de migration",
      address: "1 Rue du Backfill",
      phone: "+212 600 000 000",
      total: totalPayable - 500,
      shippingFee: 500,
      totalPayable,
      status,
    },
  })
  return commande.id
}

async function daterLaDerniereEcriture(
  orderId: string,
  instant: Date
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Order" SET "updatedAt" = $1 WHERE "id" = $2`,
    instant,
    orderId
  )
}

afterAll(async () => {
  await prisma.order.deleteMany({
    where: { user: { email: { startsWith: PREFIXE } } },
  })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("la migration de l'Encaissement de la livraison", () => {
  it("est additive : une colonne, deux tables, aucun retrait", () => {
    const sql = lireLaMigration()

    expect(MIGRATION).toMatch(/^\d{14}_[a-z0-9_]+$/)
    expect(sql).toContain('ADD COLUMN "deliveredAt" TIMESTAMPTZ(3)')
    expect(sql).toContain('CREATE TABLE "Payment"')
    expect(sql).toContain('CREATE TABLE "OrderStatusChange"')
    expect(sql).toContain(
      'CREATE INDEX "OrderStatusChange_orderId_changedAt_idx"'
    )
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i)
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE/i)
  })

  it("backfill les Commandes Livrée une fois, sans inventer d'histoire", async () => {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `${PREFIXE}backfill@test.ma`,
        name: "Utilisateur du backfill",
      },
    })
    const livree = await creerCommande(user.id, "delivered", 12_500)
    const retournee = await creerCommande(user.id, "returned", 8_000)
    const instant = new Date("2026-02-03T04:05:06.789Z")
    await daterLaDerniereEcriture(livree, instant)
    await daterLaDerniereEcriture(retournee, instant)

    await prisma.$executeRawUnsafe(lireLeBackfill())

    const commandeLivree = await prisma.order.findUniqueOrThrow({
      where: { id: livree },
    })
    const encaissements = await prisma.payment.findMany({
      where: { orderId: livree },
    })
    expect(commandeLivree.deliveredAt).not.toBeNull()
    expect(commandeLivree.deliveredAt!.getTime()).toBe(
      commandeLivree.updatedAt.getTime()
    )
    expect(encaissements).toHaveLength(1)
    expect(encaissements[0]).toMatchObject({
      orderId: livree,
      amount: 12_500,
      mode: "cash_on_delivery",
      recordedById: null,
    })
    expect(encaissements[0].collectedAt.getTime()).toBe(
      commandeLivree.updatedAt.getTime()
    )

    const commandeRetournee = await prisma.order.findUniqueOrThrow({
      where: { id: retournee },
    })
    expect(commandeRetournee.deliveredAt).toBeNull()
    await expect(
      prisma.payment.count({ where: { orderId: retournee } })
    ).resolves.toBe(0)

    // Aucune ligne d'histoire n'est fabriquée pour les Commandes antérieures.
    await expect(
      prisma.orderStatusChange.count({
        where: { orderId: { in: [livree, retournee] } },
      })
    ).resolves.toBe(0)

    // Rejouable : le second passage ne duplique aucun Encaissement.
    await prisma.$executeRawUnsafe(lireLeBackfill())

    await expect(
      prisma.payment.count({ where: { orderId: livree } })
    ).resolves.toBe(1)
    await expect(
      prisma.payment.count({ where: { orderId: retournee } })
    ).resolves.toBe(0)
    await expect(
      prisma.payment.findMany({
        where: { orderId: livree },
        select: { id: true },
      })
    ).resolves.toEqual([{ id: encaissements[0].id }])
  })
})
