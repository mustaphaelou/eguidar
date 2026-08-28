import { describe, expect, it } from "vitest"

import {
  estEncaissée,
  ORDER_STATUS_LABELS,
  STATUTS_ENCAISSÉS,
} from "@/lib/order-status"

const STATUTS = Object.keys(ORDER_STATUS_LABELS) as Array<
  keyof typeof ORDER_STATUS_LABELS
>

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
