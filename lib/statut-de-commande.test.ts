import { describe, expect, expectTypeOf, it } from "vitest"

import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  estStatut,
  peutCloreParRetour,
  peutTransitionner,
  REGISTRE_STATUTS,
  STATUTS_VALIDES,
  TRANSITIONS_AUTORISÉES,
  TRANSITIONS_OFFERTES,
  transitionsDisponibles,
} from "@/lib/statut-de-commande"

const STATUTS = Object.keys(REGISTRE_STATUTS) as OrderStatus[]

const MATRICE_ATTENDUE: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  returned: [],
}

const MATRICE_AUTORISÉE: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
}

describe("REGISTRE_STATUTS", () => {
  it("specifies a verbe for every statut except the initial one", () => {
    for (const statut of STATUTS) {
      expect(REGISTRE_STATUTS[statut].verbe === null).toBe(statut === "pending")
    }
  })

  it("ne porte ni encaissement ni réapprovisionnement", () => {
    for (const statut of STATUTS) {
      expect(Object.keys(REGISTRE_STATUTS[statut]).sort()).toEqual([
        "libellé",
        "ton",
        "verbe",
      ])
    }
  })
})

describe("les tables de transitions", () => {
  it("expose la table étroite et la table large", () => {
    expect(TRANSITIONS_OFFERTES).toEqual(MATRICE_ATTENDUE)
    expect(TRANSITIONS_AUTORISÉES).toEqual(MATRICE_AUTORISÉE)
  })
})

describe("peutTransitionner", () => {
  it("répond la matrice étroite sur les 36 couples", () => {
    for (const statut of STATUTS) {
      for (const cible of STATUTS) {
        const offerte = TRANSITIONS_OFFERTES[statut].includes(cible)
        const autorisee = TRANSITIONS_AUTORISÉES[statut].includes(cible)
        const contexte = `${statut} → ${cible}`

        expect(offerte, contexte).toBe(MATRICE_ATTENDUE[statut].includes(cible))
        expect(autorisee, contexte).toBe(
          MATRICE_AUTORISÉE[statut].includes(cible)
        )
        expect(offerte && !autorisee, contexte).toBe(false)
        expect(offerte && cible === "returned", contexte).toBe(false)
        expect(peutTransitionner(statut, cible), contexte).toBe(offerte)
        expect(peutCloreParRetour(statut)).toBe(
          MATRICE_AUTORISÉE[statut].includes("returned")
        )
      }
    }
  })

  it("refuses every self-transition", () => {
    for (const statut of STATUTS) {
      expect(peutTransitionner(statut, statut), `${statut} → ${statut}`).toBe(
        false
      )
    }
  })

  it("lets terminal statuts allow nothing", () => {
    for (const statut of ["cancelled", "returned"] as const) {
      for (const cible of STATUTS) {
        expect(peutTransitionner(statut, cible), `${statut} → ${cible}`).toBe(
          false
        )
      }
    }
  })

  it("ne clôt par retour que depuis une Commande expédiée ou livrée", () => {
    for (const statut of STATUTS) {
      expect(peutCloreParRetour(statut), statut).toBe(
        statut === "shipped" || statut === "delivered"
      )
    }
  })
})

describe("transitionsDisponibles", () => {
  it("returns exactly the targets of la table étroite", () => {
    for (const statut of STATUTS) {
      expect(transitionsDisponibles(statut)).toEqual(MATRICE_ATTENDUE[statut])
      expect(transitionsDisponibles(statut)).toEqual(
        TRANSITIONS_OFFERTES[statut]
      )
    }
  })

  it("returns exactly the targets peutTransitionner allows", () => {
    for (const statut of STATUTS) {
      const attendues = STATUTS.filter((cible) =>
        peutTransitionner(statut, cible)
      )
      expect([...transitionsDisponibles(statut)].sort()).toEqual(
        [...attendues].sort()
      )
    }
  })

  it("returns a readonly list", () => {
    expectTypeOf(transitionsDisponibles).returns.toEqualTypeOf<
      readonly OrderStatus[]
    >()
  })

  it("only offers declared statuts as targets", () => {
    for (const statut of STATUTS) {
      for (const cible of transitionsDisponibles(statut)) {
        expect(STATUTS_VALIDES).toContain(cible)
      }
    }
  })
})

describe("estStatut", () => {
  it("accepts exactly the declared statuts", () => {
    for (const statut of STATUTS) {
      expect(estStatut(statut), statut).toBe(true)
    }
  })

  it("rejects arbitrary, empty and malformed tokens", () => {
    const jetons = ["inconnu", "", "PENDING", "pending ", "pendingx", "0"]
    for (const jeton of jetons) {
      expect(estStatut(jeton), jeton).toBe(false)
    }
  })
})

describe("STATUTS_VALIDES", () => {
  it("covers every enum member", () => {
    expect([...STATUTS_VALIDES]).toEqual([
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
      "returned",
    ])
  })
})
