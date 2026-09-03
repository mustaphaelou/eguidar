import { describe, expect, it } from "vitest"

import { selectionnerDevis } from "@/lib/use-cases/devis"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison"

const city = (id: string, name: string, fee: number): DeliveryCityOption => ({
  id,
  name,
  fee,
})

const quote = (
  subtotal: number,
  shippingFee: number
): ShippingQuote => ({
  subtotal,
  shippingFee,
  total: subtotal + shippingFee,
})

const cities = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

const quotes: Record<string, ShippingQuote> = {
  c1: quote(50000, 3500),
  c2: quote(50000, 5000),
}

const nullTrio = {
  selectedCityId: null,
  selectedCity: null,
  selectedQuote: null,
}

describe("selectionnerDevis", () => {
  it("resolves a known city id to that city and its quote", () => {
    const selection = selectionnerDevis(cities, quotes, "c1")

    expect(selection.selectedCityId).toBe("c1")
    expect(selection.selectedCity).toEqual(city("c1", "Casablanca", 3500))
    expect(selection.selectedQuote).toEqual(quote(50000, 3500))
    expect(selection.selectedQuote).toBe(quotes["c1"])
  })

  it("resolves the other known city id to its own city and quote", () => {
    const selection = selectionnerDevis(cities, quotes, "c2")

    expect(selection.selectedCityId).toBe("c2")
    expect(selection.selectedCity).toEqual(city("c2", "Rabat", 5000))
    expect(selection.selectedQuote).toBe(quotes["c2"])
  })

  it("resolves an absent requested id to the null trio", () => {
    expect(selectionnerDevis(cities, quotes)).toEqual(nullTrio)
  })

  it("resolves a null requested id to the null trio", () => {
    expect(selectionnerDevis(cities, quotes, null)).toEqual(nullTrio)
  })

  it("resolves an unknown requested id to the null trio", () => {
    expect(selectionnerDevis(cities, quotes, "ville-inconnue")).toEqual(
      nullTrio
    )
  })

  it("resolves a known city without a quote to the null trio (never half-selects)", () => {
    const withoutQuote: Record<string, ShippingQuote> = {
      c1: quote(50000, 3500),
    }

    expect(selectionnerDevis(cities, withoutQuote, "c2")).toEqual(nullTrio)
  })

  it("resolves a quote without its city object to the null trio (never half-selects)", () => {
    expect(
      selectionnerDevis([city("c1", "Casablanca", 3500)], quotes, "c2")
    ).toEqual(nullTrio)
  })

  it("is independent of pricing (zero-fee and full-fee quotes select the same way)", () => {
    const freeQuotes: Record<string, ShippingQuote> = {
      c1: quote(50000, 0),
      c2: quote(50000, 0),
    }

    expect(selectionnerDevis(cities, freeQuotes, "c1")).toEqual({
      selectedCityId: "c1",
      selectedCity: city("c1", "Casablanca", 3500),
      selectedQuote: freeQuotes["c1"],
    })
    expect(selectionnerDevis(cities, quotes, "c1").selectedCityId).toBe(
      selectionnerDevis(cities, freeQuotes, "c1").selectedCityId
    )
  })

  it("never throws on empty inputs", () => {
    expect(() => selectionnerDevis([], {}, "c1")).not.toThrow()
    expect(selectionnerDevis([], {}, "c1")).toEqual(nullTrio)
    expect(selectionnerDevis([], {}, undefined)).toEqual(nullTrio)
  })
})
