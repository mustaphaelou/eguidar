import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  ACTIONS_AUTOMATION,
  CONDITIONS_AUTOMATION,
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

  it("sème les règles du code en création seule, sans doublon", async () => {
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

  it("ne réécrit pas une règle existante lors d'un semis ultérieur", async () => {
    await semerLesRegles()

    const avant = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "statut-commande" },
    })
    const revisionsAvant = await prisma.automationRuleRevision.count({
      where: { ruleId: "statut-commande" },
    })

    const modifiees = REGLES_AUTOMATION.map((regle) =>
      regle.id === "statut-commande"
        ? {
            ...regle,
            condition: { type: "statut-commande" as const, statuts: [] },
          }
        : regle
    )
    await semerLesRegles(modifiees, "proprietaire")

    const apres = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "statut-commande" },
    })
    expect(apres.condition).toEqual(avant.condition)
    expect(apres.enabled).toBe(avant.enabled)
    expect(apres.name).toBe(avant.name)
    expect(
      await prisma.automationRuleRevision.count({
        where: { ruleId: "statut-commande" },
      })
    ).toBe(revisionsAvant)
  })

  it("ne sème aucune règle morte : chaque déclencheur existe", () => {
    for (const regle of REGLES_AUTOMATION) {
      expect(regle.declencheur).toMatch(/^[a-z-]+(\.[a-z-]+)+$/)
      expect(ACTIONS_AUTOMATION).toContain(regle.action)
    }
  })

  it("crée une règle nouvelle sans toucher aux règles ni aux révisions existantes", async () => {
    await semerLesRegles()
    const reglesAvant = await prisma.automationRule.findMany({
      orderBy: { id: "asc" },
    })
    const revisionsAvant = await prisma.automationRuleRevision.findMany({
      orderBy: [{ ruleId: "asc" }, { id: "asc" }],
    })
    const nouvelle = {
      id: "nouvelle-regle",
      nom: "Nouvelle Règle",
      declencheur: "produit.enregistre" as const,
      condition: { type: "toujours" as const },
      action: "index.produit" as const,
      actif: true,
    }

    await semerLesRegles([...REGLES_AUTOMATION, nouvelle])

    const reglesApres = await prisma.automationRule.findMany({
      orderBy: { id: "asc" },
    })
    expect(reglesApres.map((regle) => regle.id)).toEqual(
      [...reglesAvant.map((regle) => regle.id), "nouvelle-regle"].sort()
    )
    expect(
      reglesApres.filter((regle) => regle.id !== "nouvelle-regle")
    ).toEqual(reglesAvant)
    const revisionsApres = await prisma.automationRuleRevision.findMany({
      orderBy: [{ ruleId: "asc" }, { id: "asc" }],
    })
    expect(
      revisionsApres.filter((revision) => revision.ruleId !== "nouvelle-regle")
    ).toEqual(revisionsAvant)
    expect(
      revisionsApres.filter((revision) => revision.ruleId === "nouvelle-regle")
    ).toHaveLength(1)

    await semerLesRegles([...REGLES_AUTOMATION, nouvelle])
    expect(
      await prisma.automationRule.count({ where: { id: "nouvelle-regle" } })
    ).toBe(1)
    expect(
      await prisma.automationRuleRevision.count({
        where: { ruleId: "nouvelle-regle" },
      })
    ).toBe(1)
  })

  it("absorbe la course de deux semis concurrents : une ligne et une révision par règle", async () => {
    await Promise.all([semerLesRegles(), semerLesRegles()])

    expect(await prisma.automationRule.count()).toBe(REGLES_AUTOMATION.length)
    const revisions = await prisma.automationRuleRevision.groupBy({
      by: ["ruleId"],
      _count: { _all: true },
    })
    expect(revisions).toHaveLength(REGLES_AUTOMATION.length)
    expect(revisions.every((revision) => revision._count._all === 1)).toBe(true)
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
