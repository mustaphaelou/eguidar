import {
  laConditionEstRemplie,
  type ConditionAutomation,
  type TypeConditionAutomation,
} from "@/lib/automations/vocabulaire"

/**
 * La Décision d'automatisation (ADR-0044) : le jugement pur de « cette Règle,
 * cet Événement ». Elle reçoit les lignes telles que Prisma les porte — aucun
 * adaptateur — et ne rend jamais de phrase : chaque consommateur écrit la
 * sienne. Aucune base, aucun port, aucune transaction.
 */
export interface RegleDecision {
  trigger: string
  enabled: boolean
  condition: unknown
}

export interface EvenementDecision {
  type: string
  payload: unknown
  expiresAt: Date
}

export interface RaisonDeclencheurDifferent {
  type: "declencheur-different"
  attendu: string
  recu: string
}

export interface RaisonRegleDesactivee {
  type: "regle-desactivee"
}

export interface RaisonEvenementExpire {
  type: "evenement-expire"
  expireLe: Date
}

export interface RaisonConditionNonRemplie {
  type: "condition-non-remplie"
  condition: unknown
  statut: unknown
}

export type RaisonIgnoree =
  | RaisonDeclencheurDifferent
  | RaisonRegleDesactivee
  | RaisonEvenementExpire
  | RaisonConditionNonRemplie

export type DecisionAutomation =
  | {
      decision: "executer"
      condition: TypeConditionAutomation
      statut?: unknown
    }
  | { decision: "ignorer"; raison: RaisonIgnoree }

/**
 * Le prédicat partagé d'expiration : la borne est inclusive, un Événement qui
 * expire exactement maintenant n'exécute plus son action.
 */
export function evenementEstExpire(expiresAt: Date, maintenant: Date): boolean {
  return expiresAt.getTime() <= maintenant.getTime()
}

function statutDeLaCharge(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return undefined
  return (payload as { statut?: unknown }).statut
}

/**
 * L'ordre est canonique : déclencheur → état → expiration → condition. Le
 * premier motif gagne, et la condition n'est lue qu'une fois les trois
 * premiers satisfaits.
 */
export function deciderAutomation(
  regle: RegleDecision,
  evenement: EvenementDecision,
  maintenant: Date
): DecisionAutomation {
  if (regle.trigger !== evenement.type) {
    return {
      decision: "ignorer",
      raison: {
        type: "declencheur-different",
        attendu: regle.trigger,
        recu: evenement.type,
      },
    }
  }

  if (!regle.enabled) {
    return { decision: "ignorer", raison: { type: "regle-desactivee" } }
  }

  if (evenementEstExpire(evenement.expiresAt, maintenant)) {
    return {
      decision: "ignorer",
      raison: { type: "evenement-expire", expireLe: evenement.expiresAt },
    }
  }

  const condition = regle.condition
  if (!laConditionEstRemplie(condition, evenement.payload)) {
    return {
      decision: "ignorer",
      raison: {
        type: "condition-non-remplie",
        condition,
        statut: statutDeLaCharge(evenement.payload),
      },
    }
  }

  const type = (condition as ConditionAutomation).type
  return {
    decision: "executer",
    condition: type,
    ...(type === "statut-commande"
      ? { statut: statutDeLaCharge(evenement.payload) }
      : {}),
  }
}
