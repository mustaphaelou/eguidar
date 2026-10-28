import type { StatutAutomation } from "@/lib/generated/prisma/client"

export const STATUTS_EXECUTION = Object.freeze([
  "en_attente",
  "en_cours",
  "reussi",
  "echoue",
  "ignore",
  "mort",
] as const)

export interface FiltresExecutions {
  statut: StatutAutomation | null
  regleId: string | null
  depuis: Date | null
}

export const FILTRES_EXECUTIONS_VIDES: FiltresExecutions = Object.freeze({
  statut: null,
  regleId: null,
  depuis: null,
})

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

function dateDeJour(valeur: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null
  const date = new Date(`${valeur}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  if (date.toISOString().slice(0, 10) !== valeur) return null
  return date
}

/**
 * La grammaire de l'historique : `?statut=echoue&regle=<id>&depuis=2026-10-21`.
 * Une valeur inconnue est ignorée — un filtre qui ne veut rien dire ne filtre
 * pas au hasard, il ne filtre pas.
 */
export function parseFiltresExecutions(
  raw: Record<string, string | string[] | undefined>
): FiltresExecutions {
  const statut = premier(raw.statut)
  const regle = premier(raw.regle)?.trim()
  const depuis = premier(raw.depuis)?.trim()

  return {
    statut:
      statut && (STATUTS_EXECUTION as readonly string[]).includes(statut)
        ? (statut as StatutAutomation)
        : null,
    regleId: regle ? regle : null,
    depuis: depuis ? dateDeJour(depuis) : null,
  }
}

export function construireUrlExecutions(filtres: FiltresExecutions): string {
  const parametres = new URLSearchParams()
  if (filtres.statut) parametres.set("statut", filtres.statut)
  if (filtres.regleId) parametres.set("regle", filtres.regleId)
  if (filtres.depuis) {
    parametres.set("depuis", filtres.depuis.toISOString().slice(0, 10))
  }
  const requete = parametres.toString()
  return requete ? `?${requete}` : ""
}
