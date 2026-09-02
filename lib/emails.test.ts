import { describe, expect, it } from "vitest"

import { type OrderEmailSnapshot, orderDetailsHtml } from "./emails"

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
})
