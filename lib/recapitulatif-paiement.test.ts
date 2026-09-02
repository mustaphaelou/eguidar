import { describe, expect, it } from "vitest"

import {
  type RécapitulatifFacts,
  type RécapitulatifRow,
  récapitulatifRows,
} from "./recapitulatif-paiement"

describe("récapitulatifRows", () => {
  it("pins the exact label strings and detail kinds for a full quote", () => {
    const facts: RécapitulatifFacts = {
      sousTotal: 25000,
      shipping: { fee: 3000, city: "Casablanca" },
      total: 28000,
    }

    const rows = récapitulatifRows(facts)

    expect(rows).toEqual<RécapitulatifRow[]>([
      {
        label: "Sous-total (TVA incluse)",
        value: "250,00\u00A0MAD",
        kind: "detail",
      },
      {
        label: "Livraison (Casablanca)",
        value: "30,00\u00A0MAD",
        kind: "detail",
      },
      {
        label: "Total à payer à la livraison",
        value: "280,00\u00A0MAD",
        kind: "total",
      },
    ])
  })

  it("renders 'Livraison' without parenthetical when no city is specified", () => {
    const facts: RécapitulatifFacts = {
      sousTotal: 10000,
      shipping: { fee: 2000 },
      total: 12000,
    }

    const rows = récapitulatifRows(facts)

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison",
      value: "20,00\u00A0MAD",
      kind: "detail",
    })
  })

  it("applies the zero-fee rule with 'Livraison offerte' and the offered tone", () => {
    const facts: RécapitulatifFacts = {
      sousTotal: 30000,
      shipping: { fee: 0, city: "Rabat" },
      total: 30000,
    }

    const rows = récapitulatifRows(facts)

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison (Rabat)",
      value: "Livraison offerte",
      kind: "detail",
      tone: "offered",
    })
  })

  it("renders 'À choisir' with muted tone when shipping is null and omits the total row", () => {
    const facts: RécapitulatifFacts = {
      sousTotal: 15000,
      shipping: null,
      total: null,
    }

    const rows = récapitulatifRows(facts)

    expect(rows).toEqual<RécapitulatifRow[]>([
      {
        label: "Sous-total (TVA incluse)",
        value: "150,00\u00A0MAD",
        kind: "detail",
      },
      {
        label: "Livraison",
        value: "À choisir",
        kind: "detail",
        tone: "muted",
      },
    ])
    expect(rows.some((r) => r.kind === "total")).toBe(false)
  })

  it("renders 'À choisir' with muted tone when shipping fee is null", () => {
    const facts: RécapitulatifFacts = {
      sousTotal: 15000,
      shipping: { fee: null, city: "Tanger" },
      total: null,
    }

    const rows = récapitulatifRows(facts)

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison (Tanger)",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(rows).toHaveLength(2)
  })

  it("rejects retired spellings across all rows", () => {
    const samples: RécapitulatifFacts[] = [
      {
        sousTotal: 10000,
        shipping: { fee: 0, city: "Casablanca" },
        total: 10000,
      },
      {
        sousTotal: 10000,
        shipping: { fee: 2000, city: "Fès" },
        total: 12000,
      },
      {
        sousTotal: 10000,
        shipping: null,
        total: null,
      },
    ]

    for (const facts of samples) {
      const rows = récapitulatifRows(facts)
      const labels = rows.map((r) => r.label)
      const values = rows.map((r) => r.value)

      // Retired total spelling
      expect(labels).not.toContain("Total")
      expect(labels).not.toContain("Total général")
      expect(labels).not.toContain("Montant total")

      // Retired delivery spellings
      for (const label of labels) {
        expect(label).not.toMatch(/^Livraison à /)
        expect(label).not.toBe("Frais de livraison")
        expect(label).not.toBe("Coût de livraison")
      }

      // Zero-fee rule should never output 0,00 MAD
      if (facts.shipping?.fee === 0) {
        expect(values).not.toContain("0,00 MAD")
      }
    }
  })
})
