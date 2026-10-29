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
      regle.id === "statut-commande"
        ? {
            ...regle,
            condition: { type: "statut-commande" as const, statuts: [] },
          }
        : regle
    )
    await semerLesRegles(modifiees, "proprietaire")

    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "statut-commande" },
    })
    expect(regle.condition).toEqual({ type: "statut-commande", statuts: [] })

    const revisions = await prisma.automationRuleRevision.findMany({
      where: { ruleId: "statut-commande" },
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

  it("refuse une combinaison non prise en charge en la nommant", () => {
    expect(() =>
      verifierRegle({
        id: "boucle-interdite",
        nom: "Boucle interdite",
        declencheur: "produit.enregistre",
        condition: { type: "toujours" },
        action: "email.commande-statut",
        actif: true,
      })
    ).toThrow(
      "Combinaison non prise en charge : « Produit enregistré » (produit.enregistre) ne déclenche pas « E-mail de statut de Commande » (email.commande-statut)."
    )
  })

  it("n'admet qu'un nom de variable d'environnement comme destinataire", () => {
    const digest = verifierRegle({
      id: "digest-configure",
      nom: "Digest configuré",
      declencheur: "planification.digest-stock-bas",
      condition: { type: "toujours" },
      action: "digest.stock-bas",
      configuration: { destinataireVariable: "ADMIN_EMAIL" },
      actif: true,
    })
    expect(digest.configuration).toEqual({
      destinataireVariable: "ADMIN_EMAIL",
    })

    expect(() =>
      verifierRegle({
        id: "digest-url",
        nom: "Digest URL",
        declencheur: "planification.digest-stock-bas",
        condition: { type: "toujours" },
        action: "digest.stock-bas",
        configuration: { destinataireVariable: "https://exfiltration.example" },
        actif: true,
      })
    ).toThrow(/variable d'environnement/)
  })

  it("conserve le nom de la variable, jamais sa valeur, dans l'instantané semé", async () => {
    await semerLesRegles([
      {
        id: "digest-configure",
        nom: "Digest configuré",
        declencheur: "planification.digest-stock-bas",
        condition: { type: "toujours" },
        action: "digest.stock-bas",
        configuration: { destinataireVariable: "ADMIN_EMAIL" },
        actif: true,
      },
    ])

    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "digest-configure" },
    })
    expect(regle.actionConfig).toEqual({ destinataireVariable: "ADMIN_EMAIL" })
    const revision = await prisma.automationRuleRevision.findFirstOrThrow({
      where: { ruleId: "digest-configure" },
    })
    expect(JSON.stringify(revision.snapshot)).toContain("ADMIN_EMAIL")
  })
})
