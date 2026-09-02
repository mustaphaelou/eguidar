import { describe, expect, it } from "vitest"

import {
  type RécapitulatifFacts,
  type RécapitulatifRow,
  récapitulatifRows,
  récapitulatifRowsFromCommande,
  récapitulatifRowsFromDevis,
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

describe("récapitulatifRowsFromDevis", () => {
  const cities = [
    { id: "casa", name: "Casablanca", fee: 3000 },
    { id: "rabat", name: "Rabat", fee: 2500 },
  ]
  const quotes = {
    casa: { subtotal: 25000, shippingFee: 3000, total: 28000 },
    rabat: { subtotal: 25000, shippingFee: 2500, total: 27500 },
  }

  it("renders 'Livraison — À choisir' with muted tone and omits the total when no city is selected", () => {
    const rows = récapitulatifRowsFromDevis({
      sousTotal: 15000,
      cities,
      quotes,
      selectedCityId: null,
    })

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
  })

  it("falls back to 'Livraison' without city when the selected city id is omitted", () => {
    const rows = récapitulatifRowsFromDevis({
      sousTotal: 15000,
      cities,
      quotes,
    })

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(rows.some((r) => r.kind === "total")).toBe(false)
  })

  it("falls back to 'Livraison' without city for an unknown city id without throwing", () => {
    expect(() =>
      récapitulatifRowsFromDevis({
        sousTotal: 15000,
        cities,
        quotes,
        selectedCityId: "ville-perimee",
      }),
    ).not.toThrow()
    const rows = récapitulatifRowsFromDevis({
      sousTotal: 15000,
      cities,
      quotes,
      selectedCityId: "ville-perimee",
    })

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(rows.some((r) => r.kind === "total")).toBe(false)
  })

  it("renders 'Livraison (Ville)' with the Devis fee and total when a city is selected", () => {
    const rows = récapitulatifRowsFromDevis({
      sousTotal: 25000,
      cities,
      quotes,
      selectedCityId: "casa",
    })

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

  it("renders the offered tone for a Devis with free shipping", () => {
    const rows = récapitulatifRowsFromDevis({
      sousTotal: 30000,
      cities: [{ id: "rabat", name: "Rabat", fee: 2500 }],
      quotes: {
        rabat: { subtotal: 30000, shippingFee: 0, total: 30000 },
      },
      selectedCityId: "rabat",
    })

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison (Rabat)",
      value: "Livraison offerte",
      kind: "detail",
      tone: "offered",
    })
    expect(rows[2]).toEqual<RécapitulatifRow>({
      label: "Total à payer à la livraison",
      value: "300,00\u00A0MAD",
      kind: "total",
    })
  })

  it("accepts a spread PanierQuote (threshold/selected extras are ignored)", () => {
    const panierQuote = {
      cities,
      threshold: 100000,
      quotes,
      selected: null,
    }

    const rows = récapitulatifRowsFromDevis({
      ...panierQuote,
      sousTotal: 25000,
      selectedCityId: "rabat",
    })

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison (Rabat)",
      value: "25,00\u00A0MAD",
      kind: "detail",
    })
    expect(rows[2]?.value).toBe("275,00\u00A0MAD")
  })
})

describe("récapitulatifRowsFromCommande", () => {
  it("renders the city, fee and the Commande totalPayable", () => {
    const rows = récapitulatifRowsFromCommande({
      total: 25000,
      shippingFee: 3000,
      totalPayable: 28000,
      cityName: "Casablanca",
    })

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

  it("consumes the precomputed totalPayable and never re-derives total + shippingFee", () => {
    const rows = récapitulatifRowsFromCommande({
      total: 20000,
      shippingFee: 3000,
      // Volontairement distinct de total + shippingFee (23000)
      // pour verrouiller la règle : on affiche totalPayable tel quel.
      totalPayable: 25000,
      cityName: "Casablanca",
    })

    expect(rows.find((r) => r.kind === "total")).toEqual<RécapitulatifRow>({
      label: "Total à payer à la livraison",
      value: "250,00\u00A0MAD",
      kind: "total",
    })
  })

  it("renders the offered tone for a Commande with free shipping", () => {
    const rows = récapitulatifRowsFromCommande({
      total: 30000,
      shippingFee: 0,
      totalPayable: 30000,
      cityName: "Rabat",
    })

    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison (Rabat)",
      value: "Livraison offerte",
      kind: "detail",
      tone: "offered",
    })
  })

  it("rejects retired spellings through the Devis and Commande entries", () => {
    const rowsList = [
      récapitulatifRowsFromDevis({
        sousTotal: 10000,
        cities: [{ id: "casa", name: "Casablanca", fee: 2000 }],
        quotes: {
          casa: { subtotal: 10000, shippingFee: 0, total: 10000 },
        },
        selectedCityId: "casa",
      }),
      récapitulatifRowsFromDevis({
        sousTotal: 10000,
        cities: [{ id: "fes", name: "Fès", fee: 2000 }],
        quotes: {
          fes: { subtotal: 10000, shippingFee: 2000, total: 12000 },
        },
        selectedCityId: "fes",
      }),
      récapitulatifRowsFromDevis({
        sousTotal: 10000,
        cities: [],
        quotes: {},
        selectedCityId: null,
      }),
      récapitulatifRowsFromCommande({
        total: 10000,
        shippingFee: 2000,
        totalPayable: 12000,
        cityName: "Fès",
      }),
    ]

    for (const rows of rowsList) {
      const labels = rows.map((r) => r.label)
      const values = rows.map((r) => r.value)

      expect(labels).not.toContain("Total")
      expect(labels).not.toContain("Total général")
      expect(labels).not.toContain("Montant total")

      for (const label of labels) {
        expect(label).not.toMatch(/^Livraison à /)
        expect(label).not.toBe("Frais de livraison")
        expect(label).not.toBe("Coût de livraison")
      }

      if (values.includes("Livraison offerte")) {
        expect(values).not.toContain("0,00\u00A0MAD")
      }
    }
  })
})
