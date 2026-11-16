import { prisma } from "@/lib/db"

export const DUREE_RETENTION_EXECUTIONS_MS = 14 * 24 * 60 * 60 * 1000

export interface OptionsRétention {
  dureeMs?: number
}

export async function prunerLesExecutions(
  maintenant: Date,
  options: OptionsRétention = {}
): Promise<number> {
  const seuil = new Date(
    maintenant.getTime() - (options.dureeMs ?? DUREE_RETENTION_EXECUTIONS_MS)
  )
  const { count } = await prisma.automationRun.deleteMany({
    where: {
      startedAt: { lt: seuil },
      status: { not: "en_cours" },
    },
  })
  return count
}
