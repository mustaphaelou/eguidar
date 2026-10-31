import { describe, expect, it } from "vitest"

import {
  deciderAutomation,
  evenementEstExpire,
  type EvenementDecision,
  type RegleDecision,
} from "@/lib/automations/decision"

const MAINTENANT = new Date("2026-10-31T12:00:00.000Z")

function regle(partiel: Partial<RegleDecision> = {}): RegleDecision {
  return {
    trigger: "commande.statut.changee",
    enabled: true,
    condition: { type: "statut-commande", statuts: ["shipped"] },
    ...partiel,
  }
}

function evenement(
  partiel: Partial<EvenementDecision> = {}
): EvenementDecision {
  return {
    type: "commande.statut.changee",
    payload: { statut: "shipped" },
    expiresAt: new Date(MAINTENANT.getTime() + 60_000),
    ...partiel,
  }
}

describe("la Décision d'automatisation", () => {
  it("ignore un couple dont les déclencheurs diffèrent, en nommant les deux valeurs", () => {
    expect(
      deciderAutomation(
        regle({ trigger: "commande.creee" }),
        evenement({ type: "produit.enregistre" }),
        MAINTENANT
      )
    ).toEqual({
      decision: "ignorer",
      raison: {
        type: "declencheur-different",
        attendu: "commande.creee",
        recu: "produit.enregistre",
      },
    })
  })

  it("ignore une Règle désactivée", () => {
    expect(
      deciderAutomation(regle({ enabled: false }), evenement(), MAINTENANT)
    ).toEqual({
      decision: "ignorer",
      raison: { type: "regle-desactivee" },
    })
  })

  it("fait gagner le déclencheur sur une Règle désactivée et sur un Événement expiré", () => {
    expect(
      deciderAutomation(
        regle({
          trigger: "commande.creee",
          enabled: false,
        }),
        evenement({
          type: "produit.enregistre",
          expiresAt: new Date(MAINTENANT.getTime() - 1_000),
        }),
        MAINTENANT
      )
    ).toEqual({
      decision: "ignorer",
      raison: {
        type: "declencheur-different",
        attendu: "commande.creee",
        recu: "produit.enregistre",
      },
    })
  })

  it("fait gagner la désactivation sur l'expiration", () => {
    expect(
      deciderAutomation(
        regle({ enabled: false }),
        evenement({ expiresAt: new Date(MAINTENANT.getTime() - 1_000) }),
        MAINTENANT
      )
    ).toEqual({
      decision: "ignorer",
      raison: { type: "regle-desactivee" },
    })
  })

  it("ignore un Événement expiré en nommant sa date", () => {
    const expireLe = new Date("2026-10-31T10:30:00.000Z")
    expect(
      deciderAutomation(regle(), evenement({ expiresAt: expireLe }), MAINTENANT)
    ).toEqual({
      decision: "ignorer",
      raison: { type: "evenement-expire", expireLe },
    })
  })

  it("traite l'échéance comme inclusive et laisse passer une milliseconde de plus", () => {
    expect(evenementEstExpire(MAINTENANT, MAINTENANT)).toBe(true)
    expect(
      evenementEstExpire(new Date(MAINTENANT.getTime() + 1), MAINTENANT)
    ).toBe(false)

    expect(
      deciderAutomation(
        regle(),
        evenement({ expiresAt: MAINTENANT }),
        MAINTENANT
      )
    ).toEqual({
      decision: "ignorer",
      raison: { type: "evenement-expire", expireLe: MAINTENANT },
    })
    expect(
      deciderAutomation(
        regle({ condition: { type: "toujours" } }),
        evenement({ expiresAt: new Date(MAINTENANT.getTime() + 1) }),
        MAINTENANT
      )
    ).toEqual({ decision: "executer", condition: "toujours" })
  })

  it("ignore une condition non remplie en portant la condition et le statut brut", () => {
    const condition = { type: "statut-commande", statuts: ["shipped"] }
    expect(
      deciderAutomation(
        regle({ condition }),
        evenement({ payload: { statut: "pending" } }),
        MAINTENANT
      )
    ).toEqual({
      decision: "ignorer",
      raison: {
        type: "condition-non-remplie",
        condition,
        statut: "pending",
      },
    })
  })

  it("exécute une condition statut-commande remplie en portant le statut brut", () => {
    expect(deciderAutomation(regle(), evenement(), MAINTENANT)).toEqual({
      decision: "executer",
      condition: "statut-commande",
      statut: "shipped",
    })
  })

  it("exécute une condition toujours remplie sans porter de statut", () => {
    expect(
      deciderAutomation(
        regle({ condition: { type: "toujours" } }),
        evenement({ payload: { autre: "fait" } }),
        MAINTENANT
      )
    ).toEqual({ decision: "executer", condition: "toujours" })
  })

  it("n'exécute pas une condition statut-commande dont la charge n'a pas de statut", () => {
    const condition = { type: "statut-commande", statuts: ["shipped"] }
    expect(
      deciderAutomation(
        regle({ condition }),
        evenement({ payload: {} }),
        MAINTENANT
      )
    ).toEqual({
      decision: "ignorer",
      raison: {
        type: "condition-non-remplie",
        condition,
        statut: undefined,
      },
    })
  })

  it("n'exécute pas une condition statut-commande sur une charge qui n'est pas un objet", () => {
    const condition = { type: "statut-commande", statuts: ["shipped"] }
    for (const payload of [null, "shipped", 42, ["shipped"]]) {
      expect(
        deciderAutomation(
          regle({ condition }),
          evenement({ payload }),
          MAINTENANT
        )
      ).toEqual({
        decision: "ignorer",
        raison: {
          type: "condition-non-remplie",
          condition,
          statut: undefined,
        },
      })
    }
  })

  it("ne lit pas la condition avant le déclencheur, l'état et l'expiration", () => {
    function regleQuiInterditLaCondition(
      trigger: string,
      enabled: boolean
    ): RegleDecision {
      return {
        trigger,
        enabled,
        get condition(): never {
          throw new Error("la condition ne doit pas être lue")
        },
      }
    }

    expect(
      deciderAutomation(
        regleQuiInterditLaCondition("commande.creee", true),
        evenement({ type: "produit.enregistre" }),
        MAINTENANT
      )
    ).toMatchObject({ raison: { type: "declencheur-different" } })

    expect(
      deciderAutomation(
        regleQuiInterditLaCondition("commande.statut.changee", false),
        evenement(),
        MAINTENANT
      )
    ).toMatchObject({ raison: { type: "regle-desactivee" } })

    expect(
      deciderAutomation(
        regleQuiInterditLaCondition("commande.statut.changee", true),
        evenement({ expiresAt: MAINTENANT }),
        MAINTENANT
      )
    ).toMatchObject({ raison: { type: "evenement-expire" } })
  })
})
