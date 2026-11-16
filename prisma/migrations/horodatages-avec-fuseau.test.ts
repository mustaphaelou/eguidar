import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"

const RACINE = join(import.meta.dirname, "..", "..")
const SCHEMA = join(RACINE, "prisma", "schema.prisma")
const DOSSIER_MIGRATIONS = join(RACINE, "prisma", "migrations")
const MIGRATION = "20261115235000_horodatages_avec_fuseau"

const CONVERSION =
  /ALTER TABLE "([^"]+)"\s+ALTER COLUMN "([^"]+)" SET DATA TYPE TIMESTAMPTZ\(3\)\s+USING "([^"]+)" AT TIME ZONE 'UTC';/g

type ColonneTemporale = { modele: string; colonne: string }

type Conversion = ColonneTemporale & { using: string }

function colonnesTemporales(): ColonneTemporale[] {
  const lignes = readFileSync(SCHEMA, "utf8").split("\n")
  const colonnes: ColonneTemporale[] = []
  let modele: string | null = null

  for (const ligne of lignes) {
    const ouverture = /^model\s+(\w+)\s*\{\s*$/.exec(ligne)
    if (ouverture) {
      modele = ouverture[1]
      continue
    }
    if (/^\}\s*$/.test(ligne)) {
      modele = null
      continue
    }
    if (modele === null) continue
    const champ = /^\s+(\w+)\s+DateTime\??(?:\s|$)/.exec(ligne)
    if (champ) colonnes.push({ modele, colonne: champ[1] })
  }

  return colonnes
}

function lireMigration(): string {
  return readFileSync(
    join(DOSSIER_MIGRATIONS, MIGRATION, "migration.sql"),
    "utf8"
  )
}

function conversions(sql: string): Conversion[] {
  return [...sql.matchAll(CONVERSION)].map((trouve) => ({
    modele: trouve[1],
    colonne: trouve[2],
    using: trouve[3],
  }))
}

function instructionDeConversion(
  sql: string,
  modele: string,
  colonne: string
): string {
  const instruction = new RegExp(
    `ALTER TABLE "${modele}"\\s+ALTER COLUMN "${colonne}" SET DATA TYPE TIMESTAMPTZ\\(3\\)\\s+USING "${colonne}" AT TIME ZONE 'UTC';`
  ).exec(sql)?.[0]

  if (instruction === undefined) {
    throw new Error(
      `la migration ne convertit pas « ${modele}.${colonne} » avec un USING … AT TIME ZONE 'UTC'`
    )
  }
  return instruction
}

describe("la migration des horodatages", () => {
  it("convertit chaque colonne auditée en timestamptz(3), avec un USING explicite", () => {
    const sql = lireMigration()
    const instructions = conversions(sql)
    const nombreDAlterations = (sql.match(/ALTER\s+TABLE\s+"/g) ?? []).length

    expect(instructions.length).toBeGreaterThan(0)
    expect(nombreDAlterations).toBe(instructions.length)
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i)
    expect(sql).not.toMatch(/DELETE\s+FROM|TRUNCATE/i)

    const mauvaisUsing = instructions.filter(
      ({ colonne, using }) => colonne !== using
    )
    const doublons = instructions.filter(
      (instruction, index) =>
        instructions.findIndex(
          ({ modele, colonne }) =>
            modele === instruction.modele && colonne === instruction.colonne
        ) !== index
    )
    const prismaMigrations = instructions.filter(
      ({ modele }) => modele === "_prisma_migrations"
    )

    expect(
      mauvaisUsing.map(
        ({ modele, colonne, using }) =>
          `« ${modele}.${colonne} » est convertie avec USING "${using}", pas avec sa propre colonne.`
      )
    ).toEqual([])
    expect(
      doublons.map(
        ({ modele, colonne }) =>
          `« ${modele}.${colonne} » est convertie plusieurs fois.`
      )
    ).toEqual([])
    expect(
      prismaMigrations.map(
        ({ modele }) => `« ${modele} » ne doit pas être touchée.`
      )
    ).toEqual([])
  })

  it("annote chaque DateTime du schéma avec le fuseau", () => {
    const lignes = readFileSync(SCHEMA, "utf8")
      .split("\n")
      .filter((ligne) => /^\s+\w+\s+DateTime\??(?:\s|$)/.test(ligne))
    const sansFuseau = lignes.filter(
      (ligne) => !ligne.includes("@db.Timestamptz(3)")
    )

    expect(lignes.length).toBeGreaterThan(0)
    expect(
      sansFuseau.map(
        (ligne) =>
          `« ${ligne.trim()} » reste un timestamp sans fuseau : Prisma le recréerait en timestamp(3).`
      )
    ).toEqual([])
  })

  it("ne laisse aucun horodatage sans fuseau dans la base", async () => {
    const sansFuseau = await prisma.$queryRaw<
      { table_name: string; column_name: string }[]
    >`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'timestamp without time zone'
      ORDER BY table_name, column_name
    `
    const avecFuseau = await prisma.$queryRaw<
      { table_name: string; column_name: string; precision: number }[]
    >`
      SELECT table_name, column_name, datetime_precision::int AS precision
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'timestamp with time zone'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name, column_name
    `

    expect(
      sansFuseau.map(
        ({ table_name, column_name }) =>
          `« ${table_name}.${column_name} » est encore un timestamp sans fuseau.`
      )
    ).toEqual([])
    expect(
      avecFuseau
        .filter(({ precision }) => precision !== 3)
        .map(
          ({ table_name, column_name, precision }) =>
            `« ${table_name}.${column_name} » est en timestamptz(${precision}), pas en timestamptz(3).`
        )
    ).toEqual([])
    expect(avecFuseau).toHaveLength(colonnesTemporales().length)
  })

  it("préserve l'instant d'une valeur existante, quel que soit le fuseau de session", async () => {
    const conversion = instructionDeConversion(
      lireMigration(),
      "ArticleBlog",
      "createdAt"
    )

    const instants = [
      "2026-03-10 02:30:00.123",
      "2026-11-15 23:34:21.149",
    ] as const
    const attendus = instants.map((instant) =>
      Date.parse(`${instant.replace(" ", "T")}Z`)
    )

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "ArticleBlog" ("createdAt" timestamp(3) NOT NULL)`
      )
      await tx.$executeRawUnsafe(`SET LOCAL search_path = pg_temp`)
      for (const instant of instants) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "ArticleBlog" ("createdAt") VALUES ('${instant}')`
        )
      }

      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'America/New_York'`)
      await tx.$executeRawUnsafe(conversion)

      const lignes = await tx.$queryRawUnsafe<{ millisecondes: bigint }[]>(
        `SELECT (extract(epoch FROM "createdAt") * 1000)::bigint AS millisecondes
         FROM "ArticleBlog" ORDER BY "createdAt"`
      )

      expect(lignes.map(({ millisecondes }) => Number(millisecondes))).toEqual(
        attendus
      )
      await tx.$executeRawUnsafe(`DROP TABLE "ArticleBlog"`)
    })
  })
})
