import { describe, expect, expectTypeOf, it } from "vitest"

import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  estEncaissée,
  estStatut,
  FRAGMENT_WHERE_ENCAISSÉS,
  peutTransitionner,
  réapprovisionne,
  REGISTRE_STATUTS,
  STATUTS_ENCAISSÉS,
  STATUTS_VALIDES,
  transitionsDisponibles,
} from "@/lib/statut-de-commande"

const STATUTS = Object.keys(REGISTRE_STATUTS) as OrderStatus[]

const MATRICE_ATTENDUE: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
}

describe("estEncaissée", () => {
  it("is true exactly when the statut is Livrée", () => {
    for (const statut of STATUTS) {
      expect(estEncaissée(statut)).toBe(statut === "delivered")
    }
  })
})

describe("STATUTS_ENCAISSÉS", () => {
  it("declares exactly Livrée", () => {
    expect([...STATUTS_ENCAISSÉS]).toEqual(["delivered"])
  })
})

describe("REGISTRE_STATUTS", () => {
  it("specifies a verbe for every statut except the initial one", () => {
    for (const statut of STATUTS) {
      expect(REGISTRE_STATUTS[statut].verbe === null).toBe(statut === "pending")
    }
  })
})

describe("FRAGMENT_WHERE_ENCAISSÉS", () => {
  it("carries the delivered-only filter", () => {
    expect(FRAGMENT_WHERE_ENCAISSÉS).toEqual({ status: { in: ["delivered"] } })
  })
})

describe("peutTransitionner", () => {
  it("answers the explicit allowed/refused matrix", () => {
    for (const statut of STATUTS) {
      for (const cible of STATUTS) {
        expect(peutTransitionner(statut, cible), `${statut} → ${cible}`).toBe(
          MATRICE_ATTENDUE[statut].includes(cible)
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
})

describe("transitionsDisponibles", () => {
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

describe("réapprovisionne", () => {
  it("is true exactly for Annulée and Retournée", () => {
    for (const statut of STATUTS) {
      expect(réapprovisionne(statut), statut).toBe(
        statut === "cancelled" || statut === "returned"
      )
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
