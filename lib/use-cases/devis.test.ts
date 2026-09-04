import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  chargerDevis,
  lignesDevis,
  selectionnerDevis,
  type Devis,
} from "@/lib/use-cases/devis"
import type { ArticleDuPanier, DonneesPanier } from "@/lib/panier"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison"

const { listDeliveryCitiesMock, getFreeShippingThresholdMock } = vi.hoisted(
  () => ({
    listDeliveryCitiesMock: vi.fn(),
    getFreeShippingThresholdMock: vi.fn(),
  })
)

vi.mock("@/lib/use-cases/livraison", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/use-cases/livraison")>()
  return {
    ...actual,
    listDeliveryCities: listDeliveryCitiesMock,
    getFreeShippingThreshold: getFreeShippingThresholdMock,
  }
})

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

const aucune = { cas: "aucune" } as const

describe("selectionnerDevis", () => {
  it("resolves a known city id to that city and its quote", () => {
    expect(selectionnerDevis(cities, quotes, "c1")).toStrictEqual({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: quote(50000, 3500),
    })
  })

  it("resolves the other known city id to its own city and quote", () => {
    expect(selectionnerDevis(cities, quotes, "c2")).toStrictEqual({
      cas: "validée",
      ville: city("c2", "Rabat", 5000),
      devis: quote(50000, 5000),
    })
  })

  it("resolves an absent requested id to aucune", () => {
    expect(selectionnerDevis(cities, quotes)).toStrictEqual(aucune)
  })

  it("resolves a null requested id to aucune", () => {
    expect(selectionnerDevis(cities, quotes, null)).toStrictEqual(aucune)
  })

  it("resolves an unknown requested id to aucune", () => {
    expect(selectionnerDevis(cities, quotes, "ville-inconnue")).toStrictEqual(
      aucune
    )
  })

  it("resolves a known city without a quote to aucune (never half-selects)", () => {
    const withoutQuote: Record<string, ShippingQuote> = {
      c1: quote(50000, 3500),
    }

    expect(selectionnerDevis(cities, withoutQuote, "c2")).toStrictEqual(aucune)
  })

  it("resolves a quote without its city object to aucune (never half-selects)", () => {
    expect(
      selectionnerDevis([city("c1", "Casablanca", 3500)], quotes, "c2")
    ).toStrictEqual(aucune)
  })

  it("is independent of pricing (zero-fee and full-fee quotes select the same way)", () => {
    const freeQuotes: Record<string, ShippingQuote> = {
      c1: quote(50000, 0),
      c2: quote(50000, 0),
    }

    const selectionC1 = (cityQuote: ShippingQuote) => ({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: cityQuote,
    })

    expect(selectionnerDevis(cities, freeQuotes, "c1")).toStrictEqual(
      selectionC1(quote(50000, 0))
    )
    expect(selectionnerDevis(cities, quotes, "c1")).toStrictEqual(
      selectionC1(quote(50000, 3500))
    )
  })

  it("is idempotent (same inputs twice → same case)", () => {
    const first = selectionnerDevis(cities, quotes, "c1")
    const second = selectionnerDevis(cities, quotes, "c1")

    expect(first).toStrictEqual({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: quote(50000, 3500),
    })
    expect(second).toStrictEqual(first)

    const unknownFirst = selectionnerDevis(cities, quotes, "ville-inconnue")
    const unknownSecond = selectionnerDevis(cities, quotes, "ville-inconnue")

    expect(unknownFirst).toStrictEqual(aucune)
    expect(unknownSecond).toStrictEqual(unknownFirst)
  })

  it("never throws on empty inputs", () => {
    expect(() => selectionnerDevis([], {}, "c1")).not.toThrow()
    expect(selectionnerDevis([], {}, "c1")).toStrictEqual(aucune)
    expect(selectionnerDevis([], {}, undefined)).toStrictEqual(aucune)
  })
})

function lignePanier(
  overrides?: Partial<ArticleDuPanier>
): ArticleDuPanier {
  return {
    articlePanierId: "a1",
    variantId: "v1",
    variantName: "Standard",
    productId: "p1",
    productName: "Produit",
    productSlug: "produit",
    image: null,
    unitPrice: 50000,
    quantity: 1,
    lineTotal: 50000,
    stock: 10,
    freeShipping: false,
    ...overrides,
  }
}

function panierPourDevis(
  subtotal: number,
  freeShippingFlags: boolean[] = [false]
): DonneesPanier {
  return {
    lines: freeShippingFlags.map((freeShipping, index) =>
      lignePanier({
        articlePanierId: `a${index}`,
        variantId: `v${index}`,
        freeShipping,
        lineTotal: subtotal,
      })
    ),
    subtotal,
    itemCount: freeShippingFlags.length,
  }
}

function selectionValidee(devis: Devis): Extract<Devis, { cas: "validée" }> {
  if (devis.cas !== "validée") throw new Error("sélection validée attendue")
  return devis
}

describe("chargerDevis", () => {
  const villes = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

  beforeEach(() => {
    listDeliveryCitiesMock.mockReset()
    getFreeShippingThresholdMock.mockReset()
    listDeliveryCitiesMock.mockResolvedValue(villes)
    getFreeShippingThresholdMock.mockResolvedValue(100000)
  })

  it("returns cities, threshold, quotes, selection and rows in one call for a valid ville", async () => {
    const panier = panierPourDevis(50000)

    const devis = selectionValidee(await chargerDevis(panier, "c1"))

    expect(devis.cities).toEqual(villes)
    expect(devis.threshold).toBe(100000)
    expect(devis.quotes).toEqual({
      c1: { subtotal: 50000, shippingFee: 3500, total: 53500 },
      c2: { subtotal: 50000, shippingFee: 5000, total: 55000 },
    })
    expect(devis.cas).toBe("validée")
    expect(devis.ville).toStrictEqual(city("c1", "Casablanca", 3500))
    expect(devis.devis).toStrictEqual({
      subtotal: 50000,
      shippingFee: 3500,
      total: 53500,
    })
    expect(devis.rows).toEqual(
      lignesDevis(50000, {
        cas: "validée",
        ville: city("c1", "Casablanca", 3500),
        devis: { subtotal: 50000, shippingFee: 3500, total: 53500 },
      })
    )
    expect(devis.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      kind: "detail",
    })
    expect(devis.rows.find((row) => row.kind === "total")).toBeDefined()
  })

  it("yields the aucune selection plus À choisir rows without throwing for an unknown ville", async () => {
    const panier = panierPourDevis(50000)

    let devis: Awaited<ReturnType<typeof chargerDevis>> | null = null
    await expect(
      (async () => {
        devis = await chargerDevis(panier, "ville-inconnue")
      })()
    ).resolves.not.toThrow()

    expect(devis!.cas).toBe("aucune")
    expect(devis!.rows[1]).toEqual({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(devis!.rows.some((row) => row.kind === "total")).toBe(false)
    expect(devis!.rows).toHaveLength(2)
  })

  it("yields the aucune selection plus À choisir rows when no ville is requested", async () => {
    const panier = panierPourDevis(50000)

    for (const requested of [undefined, null] as const) {
      const devis = await chargerDevis(panier, requested)

      expect(devis.cas).toBe("aucune")
      expect(devis.rows[1]).toMatchObject({
        label: "Livraison",
        value: "À choisir",
        tone: "muted",
      })
      expect(devis.rows.some((row) => row.kind === "total")).toBe(false)
    }
  })

  it("renders the offered tone when the threshold is reached or a free-shipping article is present", async () => {
    const auSeuil = selectionValidee(await chargerDevis(panierPourDevis(150000), "c1"))
    expect(auSeuil.devis).toMatchObject({ shippingFee: 0 })
    expect(auSeuil.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      value: "Livraison offerte",
      tone: "offered",
    })

    const articleOffert = selectionValidee(
      await chargerDevis(panierPourDevis(50000, [false, true]), "c2")
    )
    expect(articleOffert.devis).toMatchObject({ shippingFee: 0 })
    expect(articleOffert.rows[1]).toMatchObject({
      label: "Livraison (Rabat)",
      value: "Livraison offerte",
      tone: "offered",
    })
  })
})
