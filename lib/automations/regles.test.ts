import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  ACTIONS_AUTOMATION,
  CONDITIONS_AUTOMATION,
  laConditionEstRemplie,
  REGLES_AUTOMATION,
  semerLesRegles,
  verifierRegle,
} from "@/lib/automations/regles"

beforeEach(async () => {
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
})

afterAll(async () => {
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.$disconnect()
})

describe("le vocabulaire fermé des règles d'automatisation", () => {
  it("ne propose que des actions et des conditions connues", () => {
    expect(ACTIONS_AUTOMATION).toContain("email.commande-creee")
    expect(ACTIONS_AUTOMATION).toContain("reconciliation.recherche")
    expect(CONDITIONS_AUTOMATION).toEqual(["toujours", "statut-commande"])
    expect(Object.isFrozen(ACTIONS_AUTOMATION)).toBe(true)
    expect(() =>
      verifierRegle({
        id: "inconnue",
        nom: "Inconnue",
        declencheur: "commande.creee",
        condition: { type: "toujours" },
        action: "script.arbitraire",
        actif: true,
      })
    ).toThrow()
  })

  it("évalue une condition sur la charge de l'événement", () => {
    expect(laConditionEstRemplie({ type: "toujours" }, {})).toBe(true)
    expect(
      laConditionEstRemplie(
        { type: "statut-commande", statuts: ["expediee"] },
        { statut: "expediee" }
      )
    ).toBe(true)
    expect(
      laConditionEstRemplie(
        { type: "statut-commande", statuts: ["expediee"] },
        { statut: "annulee" }
      )
    ).toBe(false)
    expect(
      laConditionEstRemplie(
        { type: "statut-commande", statuts: ["expediee"] },
        {}
      )
    ).toBe(false)
  })

  it("sème les règles du code, puis les met à jour sans doublon", async () => {
    await semerLesRegles()
    const premier = await prisma.automationRule.findMany({
      orderBy: { id: "asc" },
    })
    expect(premier).toHaveLength(REGLES_AUTOMATION.length)
    expect(premier.map((regle) => regle.id)).toEqual(
      [...REGLES_AUTOMATION.map((regle) => regle.id)].sort()
    )
    expect(await prisma.automationRuleRevision.count()).toBe(
      REGLES_AUTOMATION.length
    )

    await semerLesRegles()
    expect(await prisma.automationRule.count()).toBe(REGLES_AUTOMATION.length)
    expect(await prisma.automationRuleRevision.count()).toBe(
      REGLES_AUTOMATION.length
    )
  })

  it("laisse une révision à chaque changement d'une règle semée", async () => {
    await semerLesRegles()

    const modifiees = REGLES_AUTOMATION.map((regle) =>
      regle.id === "confirmation-commande"
        ? {
            ...regle,
            condition: { type: "statut-commande" as const, statuts: [] },
          }
        : regle
    )
    await semerLesRegles(modifiees, "proprietaire")

    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "confirmation-commande" },
    })
    expect(regle.condition).toEqual({ type: "statut-commande", statuts: [] })

    const revisions = await prisma.automationRuleRevision.findMany({
      where: { ruleId: "confirmation-commande" },
      orderBy: { createdAt: "asc" },
    })
    expect(revisions).toHaveLength(2)
    expect(revisions[1]!.author).toBe("proprietaire")
    expect(revisions[1]!.snapshot).toMatchObject({
      condition: { type: "statut-commande", statuts: [] },
    })
  })

  it("ne sème aucune règle morte : chaque déclencheur existe", () => {
    for (const regle of REGLES_AUTOMATION) {
      expect(regle.declencheur).toMatch(/^[a-z-]+(\.[a-z-]+)+$/)
      expect(ACTIONS_AUTOMATION).toContain(regle.action)
    }
  })
})
