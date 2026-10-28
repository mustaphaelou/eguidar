import { prisma } from "@/lib/db"

/**
 * La fenêtre de l'historique. Shopify Flow documente 14 jours
 * (research §6) : c'est la même durée pour le journal des Exécutions. Le
 * nettoyage est un travail du balayage existant — pas un second
 * ordonnanceur, pas une seconde tâche planifiée (ADR-0041).
 */
export const DUREE_RETENTION_EXECUTIONS_MS = 14 * 24 * 60 * 60 * 1000

export interface OptionsRétention {
  /** Surcharge de test ; la fenêtre documentée reste le défaut. */
  dureeMs?: number
}

/**
 * Supprime les Exécutions dont le début sort de la fenêtre. Une Exécution
 * `en_cours` n'est jamais purgée : elle porte le bail d'un Événement et doit
 * rester lisible par la reprise.
 */
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
