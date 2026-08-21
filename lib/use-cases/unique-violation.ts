import { Prisma } from "@/lib/generated/prisma/client"

export function decodeP2002Fields(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return []
  const meta = error.meta as Record<string, unknown> | undefined
  if (Array.isArray(meta?.target)) return meta.target as string[]
  const driverError = meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: string[] } } }
    | undefined
  return driverError?.cause?.constraint?.fields ?? []
}

export function hasUniqueViolation(error: unknown, fields: string[]): boolean {
  return decodeP2002Fields(error).some((target) => fields.includes(target))
}
