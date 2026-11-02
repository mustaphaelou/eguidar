import { describe, it, expect } from "vitest"

import {
  declarerApresEcriture,
  reglesParDefaut,
  GENRES_MIGRES,
} from "@/lib/apres-ecriture"

describe("Après-écriture — plan Commande", () => {
  it("commande.creee : ordre, durabilité, charge partagée, action", () => {
    const snapshot = { userEmail: "a@b", orderId: "c1" }
    const plan = declarerApresEcriture("commande.creee", {
      commandeId: "c1",
      snapshot,
    })

    expect(plan.faits).toHaveLength(1)
    expect(plan.faits[0].declencheur).toBe("commande.creee")
    expect(plan.faits[0].entite).toBe("commande")
    expect(plan.faits[0].identifiant).toBe("c1")
    expect(plan.faits[0].charge).toMatchObject({ snapshot })

    expect(plan.consequences.map((c) => c.effet)).toEqual([
      "email",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(plan.consequences.map((c) => c.durable)).toEqual([
      true,
      false,
      false,
    ])
    expect(
      plan.consequences
        .filter((c) => !c.durable)
        .every((c) => c.reparation === "TTL")
    ).toBe(true)

    const durable = plan.consequences.filter((c) => c.durable)
    expect(durable).toHaveLength(1)
    expect(durable[0].action).toBe("email.commande-creee")
  })

  it("commande.statut.changee : ordre, durabilité, charge avec statut, action", () => {
    const snapshot = { userEmail: "a@b", orderId: "c1" }
    const plan = declarerApresEcriture("commande.statut.changee", {
      commandeId: "c1",
      snapshot,
      statut: "EXPEDIEE",
      purgeCatalogue: true,
    })

    expect(plan.faits).toHaveLength(1)
    expect(plan.faits[0].declencheur).toBe("commande.statut.changee")
    expect(plan.faits[0].charge).toMatchObject({
      snapshot,
      statut: "EXPEDIEE",
    })

    expect(plan.consequences.map((c) => c.effet)).toEqual([
      "email",
      "invalidation-cache",
      "purge-catalogue",
    ])
    expect(plan.consequences.map((c) => c.durable)).toEqual([
      true,
      false,
      false,
    ])

    const durable = plan.consequences.filter((c) => c.durable)
    expect(durable).toHaveLength(1)
    expect(durable[0].action).toBe("email.commande-statut")
  })

  it("un Événement existe car une conséquence durable existe", () => {
    const avecDurable = declarerApresEcriture("commande.creee", {
      commandeId: "c1",
      snapshot: {},
    })
    expect(avecDurable.faits.length).toBeGreaterThan(0)
    expect(avecDurable.consequences.some((c) => c.durable)).toBe(true)
  })
})

describe("invariant — conséquence durable et Règle par défaut", () => {
  it("chaque conséquence durable a exactement une Règle par déclencheur, aucune pour la non durable", () => {
    const regles = reglesParDefaut()

    for (const genre of GENRES_MIGRES) {
      const facts =
        genre === "commande.creee"
          ? { commandeId: "c1", snapshot: {} }
          : {
              commandeId: "c1",
              snapshot: {},
              statut: "EXPEDIEE",
              purgeCatalogue: true,
            }

      const plan = declarerApresEcriture(genre, facts)
      const declencheur = plan.faits[0].declencheur
      const reglesDuDeclencheur = regles.filter(
        (r) => r.declencheur === declencheur
      )
      const durables = plan.consequences.filter((c) => c.durable)
      const nonDurables = plan.consequences.filter((c) => !c.durable)

      expect(reglesDuDeclencheur).toHaveLength(durables.length)
      for (const consequence of durables) {
        expect(
          reglesDuDeclencheur.filter((r) => r.action === consequence.action)
        ).toHaveLength(1)
      }
      for (const consequence of nonDurables) {
        expect(
          reglesDuDeclencheur.filter((r) => r.action === consequence.action)
        ).toHaveLength(0)
      }
    }
  })
})
