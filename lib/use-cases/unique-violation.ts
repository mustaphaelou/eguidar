import { Prisma } from "@/lib/generated/prisma/client"

type Constraint = {
  fields?: unknown
  index?: unknown
}

type UniqueViolation = {
  fields?: string[]
  index?: string
  table?: string
}

/**
 * Prisma nomme la violation de deux façons selon la version de l'adaptateur :
 * 7.9 énumère les champs (`constraint.fields`), 7.10 nomme la contrainte
 * PostgreSQL (`constraint.index` + `cause.table`).
 */
function uniqueViolationOf(error: unknown): UniqueViolation | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined
  if (error.code !== "P2002") return undefined
  const meta = error.meta as Record<string, unknown> | undefined
  if (Array.isArray(meta?.target)) return { fields: meta.target as string[] }
  const cause = (
    meta?.driverAdapterError as
      { cause?: { constraint?: Constraint; table?: unknown } } | undefined
  )?.cause
  if (!cause?.constraint) return undefined
  return {
    fields: Array.isArray(cause.constraint.fields)
      ? (cause.constraint.fields as string[])
      : undefined,
    index:
      typeof cause.constraint.index === "string"
        ? cause.constraint.index
        : undefined,
    table: typeof cause.table === "string" ? cause.table : undefined,
  }
}

function indexFields(index: string, table: string | undefined): string[] {
  const name =
    table !== undefined && index.startsWith(`${table}_`)
      ? index.slice(table.length + 1)
      : // Sans nom de table, l'index commence par le nom du modèle.
        index.replace(/^[^_]+_/, "")
  // Le schéma du dépôt donne `id` pour clé primaire à chaque modèle ; les
  // tables de jointure à clé composite n'empruntent aucun de ces chemins.
  if (name === "pkey") return ["id"]
  if (!name.endsWith("_key")) return []
  return name.slice(0, -"_key".length).split("_")
}

export function decodeP2002Fields(error: unknown): string[] {
  const violation = uniqueViolationOf(error)
  if (!violation) return []
  if (violation.fields) return violation.fields
  if (violation.index === undefined) return []
  return indexFields(violation.index, violation.table)
}

export function hasUniqueViolation(error: unknown, fields: string[]): boolean {
  return decodeP2002Fields(error).some((target) => fields.includes(target))
}
