import { describe, expect, it } from "vitest"

import { formatPrice } from "./money"
import { type RécapitulatifRow, récapitulatifRowsFromCommande } from "./recapitulatif-paiement"
import { lignesDevis } from "./use-cases/devis"

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

  it("renders 'Livraison' without city when cityName is omitted, totals intact", () => {
    const rows = récapitulatifRowsFromCommande({
      total: 25000,
      shippingFee: 3000,
      totalPayable: 28000,
    })

    expect(rows[0]).toEqual<RécapitulatifRow>({
      label: "Sous-total (TVA incluse)",
      value: formatPrice(25000),
      kind: "detail",
    })
    expect(rows[1]).toEqual<RécapitulatifRow>({
      label: "Livraison",
      value: formatPrice(3000),
      kind: "detail",
    })
    expect(rows[2]).toEqual<RécapitulatifRow>({
      label: "Total à payer à la livraison",
      value: formatPrice(28000),
      kind: "total",
    })
  })

  it("rejects retired spellings through the Devis and Commande entries", () => {
    const rowsList = [
      lignesDevis(10000, {
        cas: "validée",
        ville: { id: "casa", name: "Casablanca", fee: 2000 },
        devis: { subtotal: 10000, shippingFee: 0, total: 10000 },
      }),
      lignesDevis(10000, {
        cas: "validée",
        ville: { id: "fes", name: "Fès", fee: 2000 },
        devis: { subtotal: 10000, shippingFee: 2000, total: 12000 },
      }),
      lignesDevis(10000, { cas: "aucune" }),
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
