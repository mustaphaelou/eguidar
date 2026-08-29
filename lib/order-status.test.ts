import { describe, expect, it } from "vitest"

import {
  estEncaissée,
  FRAGMENT_WHERE_ENCAISSÉS,
  REGISTRE_STATUTS,
  STATUTS_ENCAISSÉS,
  STATUTS_VALIDES,
} from "@/lib/order-status"

const STATUTS = Object.keys(REGISTRE_STATUTS) as Array<
  keyof typeof REGISTRE_STATUTS
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
