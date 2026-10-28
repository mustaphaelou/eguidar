import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  enregistrerEvenement,
  enregistrerEvenementSiAbsent,
  TYPES_EVENEMENT_AUTOMATION,
} from "@/lib/automations/evenements"

const PREFIXE = `evt-804-${randomUUID().slice(0, 8)}-`

afterAll(async () => {
  await prisma.automationEvent.deleteMany({
    where: { entityId: { startsWith: PREFIXE } },
  })
  await prisma.$disconnect()
})

describe("le carnet de sortie des automatisations", () => {
  it("ne laisse aucun événement quand la transaction de la mutation est annulée", async () => {
    const entityId = `${PREFIXE}annule`

    await expect(
      prisma.$transaction(async (tx) => {
        await enregistrerEvenement(tx, {
          type: "commande.creee",
          entityType: "commande",
          entityId,
          payload: { commande: entityId },
        })
        throw new Error("la mutation échoue après l'écriture de l'événement")
      })
    ).rejects.toThrow("la mutation échoue")

    await expect(
      prisma.automationEvent.count({ where: { entityId } })
    ).resolves.toBe(0)
  })

  it("numérote les événements d'une même entité, et un par entité", async () => {
    const premiere = `${PREFIXE}entite-a`
    const seconde = `${PREFIXE}entite-b`

    await prisma.$transaction(async (tx) => {
      await enregistrerEvenement(tx, {
        type: "produit.enregistre",
        entityType: "produit",
        entityId: premiere,
        payload: { produitId: premiere },
      })
      await enregistrerEvenement(tx, {
        type: "variante.stock.changee",
        entityType: "produit",
        entityId: premiere,
        payload: { produitId: premiere },
      })
      await enregistrerEvenement(tx, {
        type: "produit.enregistre",
        entityType: "produit",
        entityId: seconde,
        payload: { produitId: seconde },
      })
    })

    const evenements = await prisma.automationEvent.findMany({
      where: { entityId: { in: [premiere, seconde] } },
      orderBy: [{ entityId: "asc" }, { seq: "asc" }],
    })

    expect(
      evenements.map(({ entityId, seq, type }) => ({ entityId, seq, type }))
    ).toEqual([
      { entityId: premiere, seq: 1, type: "produit.enregistre" },
      { entityId: premiere, seq: 2, type: "variante.stock.changee" },
      { entityId: seconde, seq: 1, type: "produit.enregistre" },
    ])
    expect(evenements[0]!.status).toBe("en_attente")
    expect(evenements[0]!.expiresAt.getTime()).toBeGreaterThan(
      evenements[0]!.occurredAt.getTime()
    )
  })

  it("refuse un second événement de même type, entité et tentative", async () => {
    const entityId = `${PREFIXE}unique`

    await prisma.$transaction(async (tx) => {
      await enregistrerEvenement(tx, {
        type: "planification.digest-stock-bas",
        entityType: "planification",
        entityId,
        attemptOf: 1,
        payload: { jour: "2026-10-28" },
        occurredAt: new Date("2026-10-28T07:00:00Z"),
      })
    })

    await expect(
      prisma.$transaction(async (tx) => {
        await enregistrerEvenement(tx, {
          type: "planification.digest-stock-bas",
          entityType: "planification",
          entityId,
          attemptOf: 1,
          payload: { jour: "2026-10-28" },
          occurredAt: new Date("2026-10-28T07:00:00Z"),
        })
      })
    ).rejects.toThrow()
  })

  it("laisse le planificateur rejouer la journée sans créer de doublon", async () => {
    const entityId = `${PREFIXE}jour`

    const entrees = [
      {
        type: "planification.reconciliation-recherche" as const,
        entityType: "planification" as const,
        entityId,
        attemptOf: 1,
        payload: { jour: "2026-10-28" },
        occurredAt: new Date("2026-10-28T03:00:00Z"),
      },
    ]

    const premier = await prisma.$transaction((tx) =>
      enregistrerEvenementSiAbsent(tx, entrees[0]!)
    )
    const second = await prisma.$transaction((tx) =>
      enregistrerEvenementSiAbsent(tx, entrees[0]!)
    )

    expect(premier?.id).toBeTruthy()
    expect(second).toBeNull()
    await expect(
      prisma.automationEvent.count({ where: { entityId } })
    ).resolves.toBe(1)
  })

  it("n'accepte que le vocabulaire fermé des types d'événement", () => {
    expect(TYPES_EVENEMENT_AUTOMATION).toContain("commande.creee")
    expect(TYPES_EVENEMENT_AUTOMATION).toContain("commande.statut.changee")
    expect(TYPES_EVENEMENT_AUTOMATION).toContain("produit.supprime")
    expect(Object.isFrozen(TYPES_EVENEMENT_AUTOMATION)).toBe(true)
  })
})
