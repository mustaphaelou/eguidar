import { describe, expect, expectTypeOf, it } from "vitest"

import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  estStatut,
  peutTransitionner,
  REGISTRE_STATUTS,
  STATUTS_VALIDES,
  TRANSITIONS_ADMINISTRATION,
  transitionsDisponibles,
  TRANSITIONS_TOUTES_VOIES,
} from "@/lib/statut-de-commande"

const STATUTS = Object.keys(REGISTRE_STATUTS) as OrderStatus[]

const PAIRES = STATUTS.flatMap((statut) =>
  STATUTS.map((cible) => ({ statut, cible }))
)

const MATRICE_TOUTES_VOIES: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
}

const MATRICE_ADMINISTRATION: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
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

describe("peutTransitionner", () => {
  it("answers the explicit allowed/refused matrix", () => {
    for (const statut of STATUTS) {
      for (const cible of STATUTS) {
        expect(peutTransitionner(statut, cible), `${statut} → ${cible}`).toBe(
          MATRICE_TOUTES_VOIES[statut].includes(cible)
        )
      }
    }
  })

  it("lets the reception reach Retournée through the wide table", () => {
    for (const statut of ["shipped", "delivered"] as const) {
      expect(peutTransitionner(statut, "returned"), statut).toBe(true)
      expect(peutTransitionner(statut, "returned", "retour"), statut).toBe(true)
    }
  })

  it("restricts administration origin to the Administration matrix", () => {
    for (const statut of STATUTS) {
      for (const cible of STATUTS) {
        expect(
          peutTransitionner(statut, cible, "administration"),
          `${statut} → ${cible}`
        ).toBe(MATRICE_ADMINISTRATION[statut].includes(cible))
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
})

describe("transitionsDisponibles", () => {
  it("returns exactly the Administration targets", () => {
    for (const statut of STATUTS) {
      expect([...transitionsDisponibles(statut)].sort()).toEqual(
        [...MATRICE_ADMINISTRATION[statut]].sort()
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

describe("les deux matrices de Transition de statut", () => {
  it("couvre les trente-six paires de statuts", () => {
    expect(PAIRES).toHaveLength(36)
  })

  it("sur les trente-six paires, la matrice Administration est incluse dans la matrice toutes voies et ne vise jamais Retournée", () => {
    for (const { statut, cible } of PAIRES) {
      if (!TRANSITIONS_ADMINISTRATION[statut].includes(cible)) continue
      expect(
        TRANSITIONS_TOUTES_VOIES[statut],
        `${statut} → ${cible}`
      ).toContain(cible)
      expect(cible, `${statut} → ${cible}`).not.toBe("returned")
    }
  })

  it("seule la matrice toutes voies offre Retournée comme cible", () => {
    expect(
      PAIRES.some(
        ({ statut, cible }) =>
          TRANSITIONS_TOUTES_VOIES[statut].includes(cible) &&
          cible === "returned"
      )
    ).toBe(true)
    expect(
      PAIRES.some(
        ({ statut, cible }) =>
          TRANSITIONS_ADMINISTRATION[statut].includes(cible) &&
          cible === "returned"
      )
    ).toBe(false)
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
