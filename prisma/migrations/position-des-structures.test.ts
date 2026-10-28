import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import { creerStructure } from "@/test/structure-fixtures"

const PREFIXE = `migration-position-${process.pid}-`
const DOSSIER_MIGRATIONS = join(process.cwd(), "prisma", "migrations")

function migrationDeLaPosition(): {
  dossier: string
  sql: string
} {
  const dossiers = readdirSync(DOSSIER_MIGRATIONS, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
  for (const dossier of dossiers) {
    const sql = readFileSync(
      join(DOSSIER_MIGRATIONS, dossier, "migration.sql"),
      "utf8"
    )
    if (sql.includes('ADD COLUMN "position"')) return { dossier, sql }
  }
  throw new Error("aucune migration n'ajoute la position à la Structure")
}

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("la migration de la position de la Structure", () => {
  it("est additive : une colonne qui démarre à zéro, et l'index de la fratrie", () => {
    const { dossier, sql } = migrationDeLaPosition()

    expect(dossier).toMatch(/^\d{14}_[a-z0-9_]+$/)
    expect(sql).toContain('ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0')
    expect(sql).toContain(
      'CREATE INDEX "Category_parentId_position_idx" ON "Category"("parentId", "position")'
    )
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i)
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE|ALTER\s+COLUMN/i)
    expect(sql).not.toMatch(/UPDATE\s+"Category"/i)
  })

  it("laisse chaque rangée existante à la position zéro, et le nom départager", async () => {
    const zebre = await creerStructure({
      name: "Zèbre position",
      prefix: PREFIXE,
    })
    const alpha = await creerStructure({
      name: "Alpha position",
      prefix: PREFIXE,
    })
    const ecran = await creerStructure({
      name: "Écran position",
      prefix: PREFIXE,
    })

    for (const structure of [zebre, alpha, ecran]) {
      await expect(
        prisma.category.findUniqueOrThrow({ where: { id: structure.id } })
      ).resolves.toMatchObject({ position: 0 })
    }

    const noms = (await lireStructure())
      .lignesAdmin()
      .map((ligne) => ligne.name)
      .filter((nom) => nom.endsWith(" position"))

    expect(noms).toEqual(["Alpha position", "Écran position", "Zèbre position"])
  })

  it("un second `prisma migrate deploy` ne fait rien", () => {
    const execution = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      encoding: "utf8",
    })

    const sortie = `${execution.stdout}${execution.stderr}`
    expect(execution.status, sortie).toBe(0)
    expect(sortie).toContain("No pending migrations")
  })
})
