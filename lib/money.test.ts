import { describe, expect, it } from "vitest"

import { totalPayable } from "@/lib/money"

describe("totalPayable", () => {
  it("adds the Frais de livraison to the articles subtotal", () => {
    expect(totalPayable({ total: 60000, shippingFee: 3500 })).toBe(63500)
  })

  it("keeps a zero Frais de livraison (livraison offerte)", () => {
    expect(totalPayable({ total: 100000, shippingFee: 0 })).toBe(100000)
  })
})
