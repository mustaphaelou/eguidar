import { describe, expect, it } from "vitest"

import { type OrderEmailSnapshot, orderDetailsHtml } from "./emails"
import { formatPrice } from "./money"
import { récapitulatifRowsFromCommande } from "./recapitulatif-paiement"

const baseSnapshot: OrderEmailSnapshot = {
  userEmail: "client@example.com",
  orderId: "ord_1234567890",
  items: [
    {
      productName: "Théière",
      variantName: "Argentée",
      quantity: 1,
      price: 25000,
    },
  ],
  total: 25000,
  shippingFee: 3000,
  totalPayable: 28000,
  cityName: "Casablanca",
  address: "123 Bd d'Anfa",
  phone: "0600000000",
}

describe("orderDetailsHtml", () => {
  it("renders récapitulatif rows using the unified language format with city parenthetical", () => {
    const html = orderDetailsHtml(baseSnapshot)

    expect(html).toContain("Sous-total (TVA incluse)")
    expect(html).toContain("Livraison (Casablanca)")
    expect(html).toContain("Total à payer à la livraison")
    expect(html).not.toContain("Livraison à Casablanca")
  })

  it("renders 'Livraison offerte' instead of 0,00 MAD when delivery fee is zero", () => {
    const html = orderDetailsHtml({
      ...baseSnapshot,
      shippingFee: 0,
      totalPayable: 25000,
    })

    expect(html).toContain("Livraison (Casablanca)")
    expect(html).toContain("Livraison offerte")
    expect(html).not.toMatch(/(^|[^\d])0,00\s*MAD/)
  })

  it("applies bold only to the total row", () => {
    const html = orderDetailsHtml(baseSnapshot)

    expect(html).toContain(
      '<td style="padding: 8px 0; font-weight: bold;">Total à payer à la livraison</td>'
    )
    expect(html).toContain(
      '<td style="padding: 8px 0;">Sous-total (TVA incluse)</td>'
    )
    expect(html).toContain(
      '<td style="padding: 8px 0;">Livraison (Casablanca)</td>'
    )
  })

  it("consomme le totalPayable précalculé sans re-dériver total + shippingFee", () => {
    const html = orderDetailsHtml({
      ...baseSnapshot,
      total: 20000,
      shippingFee: 3000,
      // Volontairement distinct de total + shippingFee (23000)
      // pour verrouiller la règle : l'e-mail affiche totalPayable tel quel.
      totalPayable: 25000,
    })

    expect(html).toContain(formatPrice(25000))
    expect(html).not.toContain(formatPrice(23000))
  })

  it("rend un contenu identique à l'entrée Commande pour une même Commande (ville, frais, Total à payer)", () => {
    // Les deux e-mails (confirmation + statut) partagent orderDetailsHtml :
    // ce test garde les deux chemins via le rendu partagé.
    const html = orderDetailsHtml(baseSnapshot)
    const rows = récapitulatifRowsFromCommande(baseSnapshot)

    for (const row of rows) {
      expect(html).toContain(row.label)
      expect(html).toContain(row.value)
    }
    expect(html).toContain("Livraison (Casablanca)")
    expect(html).toContain(formatPrice(25000))
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain(formatPrice(28000))
  })
})
