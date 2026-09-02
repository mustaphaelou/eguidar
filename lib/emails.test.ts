import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  type OrderEmailSnapshot,
  orderDetailsHtml,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
} from "./emails"
import { formatPrice } from "./money"

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock("@/lib/email", () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}))

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
    const html = orderDetailsHtml(baseSnapshot)

    expect(html).toContain("Sous-total (TVA incluse)")
    expect(html).toContain(formatPrice(25000))
    expect(html).toContain("Livraison (Casablanca)")
    expect(html).toContain(formatPrice(3000))
    expect(html).toContain("Total à payer à la livraison")
    expect(html).toContain(formatPrice(28000))
    expect(html).toContain("<table")
    expect(html).toContain(
      '<td style="padding: 8px 0; font-weight: bold;">Total à payer à la livraison</td>',
    )
  })
})

describe("sendOrderPlacedEmail / sendOrderStatusEmail", () => {
  beforeEach(() => {
    sendMock.mockReset()
    sendMock.mockResolvedValue({ id: "mock-id" })
  })

  it("flows both confirmation and status emails through the shared Commande récapitulatif", async () => {
    await sendOrderPlacedEmail(baseSnapshot)
    await sendOrderStatusEmail(baseSnapshot, "confirmed")

    expect(sendMock).toHaveBeenCalledTimes(2)

    const placedHtml = (sendMock.mock.calls[0][0] as { html: string }).html
    const statusHtml = (sendMock.mock.calls[1][0] as { html: string }).html

    for (const html of [placedHtml, statusHtml]) {
      expect(html).toContain("Sous-total (TVA incluse)")
      expect(html).toContain("Livraison (Casablanca)")
      expect(html).toContain("Total à payer à la livraison")
      expect(html).toContain(formatPrice(25000))
      expect(html).toContain(formatPrice(3000))
      expect(html).toContain(formatPrice(28000))
    }

    expect(placedHtml).toContain("Merci pour votre commande")
    expect(statusHtml).toContain("Confirmée")
  })
})
