import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  chargerDevisHolder,
  createDevisHolder,
  creerDevisHolder,
  DeliveryCityNotFoundError,
  type DevisHolder,
} from "@/lib/use-cases/devis"
import { selectionnerDevis } from "@/lib/use-cases/devis-coeur"
import type { ArticleDuPanier, DonneesPanier } from "@/lib/panier"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison"
import { formatPrice } from "@/lib/money"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

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

describe("internal seam: selectionnerDevis (core lookup)", () => {
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
        variantId: `v${index}`,
        freeShipping,
        lineTotal: subtotal,
      })
    ),
    subtotal,
    itemCount: freeShippingFlags.length,
  }
}



describe("chargerDevisHolder", () => {
  const villes = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

  beforeEach(() => {
    listDeliveryCitiesMock.mockReset()
    getFreeShippingThresholdMock.mockReset()
    listDeliveryCitiesMock.mockResolvedValue(villes)
    getFreeShippingThresholdMock.mockResolvedValue(100000)
  })

  it("yields a DevisHolder with precedence, selection, and pre-derived rows", async () => {
    const panier = panierPourDevis(50000)
    const holder = await chargerDevisHolder(panier, "c1")

    expect(holder.villeId).toBe("c1")
    expect(holder.villes).toEqual(villes)
    expect(holder.selection.cas).toBe("validée")
    if (holder.selection.cas === "validée") {
      expect(holder.selection.ville).toStrictEqual(city("c1", "Casablanca", 3500))
    }
    expect(holder.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      kind: "detail",
    })
    expect(holder.rows.find((row) => row.kind === "total")).toBeDefined()
  })

  it("yields aucune selection without throwing for an unknown or absent ville", async () => {
    const panier = panierPourDevis(50000)

    const holderUnknown = await chargerDevisHolder(panier, "ville-inconnue")
    expect(holderUnknown.villeId).toBeNull()
    expect(holderUnknown.selection.cas).toBe("aucune")
    expect(holderUnknown.rows[1]).toMatchObject({
      label: "Livraison",
      value: "À choisir",
      tone: "muted",
    })
    expect(holderUnknown.rows.some((row) => row.kind === "total")).toBe(false)

    const holderNone = await chargerDevisHolder(panier, null)
    expect(holderNone.villeId).toBeNull()
    expect(holderNone.selection.cas).toBe("aucune")
  })

  it("supports precedence sources (url ville winning over profile fallback)", async () => {
    const panier = panierPourDevis(50000)
    const holderWithBoth = await chargerDevisHolder(panier, {
      urlVilleId: "c1",
      profileVilleId: "c2",
    })
    expect(holderWithBoth.villeId).toBe("c1")

    const holderProfileFallback = await chargerDevisHolder(panier, {
      urlVilleId: null,
      profileVilleId: "c2",
    })
    expect(holderProfileFallback.villeId).toBe("c2")
  })

  it("intake narrowing on loaded holder validates or throws DeliveryCityNotFoundError", async () => {
    const panier = panierPourDevis(50000)
    const validHolder = await chargerDevisHolder(panier, "c1")
    expect(validHolder.selectionValidee().cas).toBe("validée")
    expect(validHolder.validerSelection().ville.id).toBe("c1")

    const emptyHolder = await chargerDevisHolder(panier, null)
    expect(() => emptyHolder.selectionValidee()).toThrow(DeliveryCityNotFoundError)
    expect(() => emptyHolder.validerSelection()).toThrow(DeliveryCityNotFoundError)
  })

  it("renders offered tone when threshold is reached or free-shipping item is present", async () => {
    const panierAuSeuil = panierPourDevis(150000)
    const holderSeuil = await chargerDevisHolder(panierAuSeuil, "c1")
    expect(holderSeuil.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      value: "Livraison offerte",
      tone: "offered",
    })

    const panierOffert = panierPourDevis(50000, [false, true])
    const holderArticleOffert = await chargerDevisHolder(panierOffert, "c2")
    expect(holderArticleOffert.rows[1]).toMatchObject({
      label: "Livraison (Rabat)",
      value: "Livraison offerte",
      tone: "offered",
    })
  })
})

describe("DevisHolder", () => {
  const sousTotal = 50000

  it("precedence: url ville wins over profile fallback on initial creation", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, {
      urlVilleId: "c1",
      profileVilleId: "c2",
    })
    expect(holder.villeId).toBe("c1")
    expect(holder.selection.cas).toBe("validée")
    if (holder.selection.cas === "validée") {
      expect(holder.selection.ville.id).toBe("c1")
    }
  })

  it("precedence: saved profile fallback is chosen when url ville is absent, empty, or whitespace", () => {
    for (const urlVilleId of [undefined, null, "", "   "]) {
      const holder = creerDevisHolder(cities, quotes, sousTotal, {
        urlVilleId,
        profileVilleId: "c2",
      })
      expect(holder.villeId).toBe("c2")
      expect(holder.selection.cas).toBe("validée")
      if (holder.selection.cas === "validée") {
        expect(holder.selection.ville.id).toBe("c2")
      }
    }
  })

  it("precedence: resolves to aucune when both url and profile are absent or empty", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, {
      urlVilleId: null,
      profileVilleId: null,
    })
    expect(holder.villeId).toBeNull()
    expect(holder.selection.cas).toBe("aucune")
  })

  it("precedence: local choice wins over both url and profile after choisir", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, {
      urlVilleId: "c1",
      profileVilleId: "c2",
    })
    expect(holder.villeId).toBe("c1")

    const chosenC2 = holder.choisir("c2")
    expect(chosenC2.villeId).toBe("c2")

    const chosenC1 = chosenC2.choisir("c1")
    expect(chosenC1.villeId).toBe("c1")

    const chosenAucune = chosenC1.choisir(null)
    expect(chosenAucune.villeId).toBeNull()
    expect(chosenAucune.selection.cas).toBe("aucune")
  })

  it("fallback: unknown ville silently resolves to aucune without throwing", () => {
    let holderFromUnknown: DevisHolder | null = null
    expect(() => {
      holderFromUnknown = creerDevisHolder(cities, quotes, sousTotal, {
        urlVilleId: "ville-inconnue",
      })
    }).not.toThrow()
    expect(holderFromUnknown!.villeId).toBeNull()
    expect(holderFromUnknown!.selection.cas).toBe("aucune")

    const validHolder = creerDevisHolder(cities, quotes, sousTotal, "c1")
    const choseUnknown = validHolder.choisir("ville-inconnue")
    expect(choseUnknown.villeId).toBeNull()
    expect(choseUnknown.selection.cas).toBe("aucune")
  })

  it("intake narrowing: selectionValidee and validerSelection return validated selection when valid", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, "c1")
    const validated1 = holder.selectionValidee()
    const validated2 = holder.validerSelection()
    expect(validated1).toStrictEqual(holder.selection)
    expect(validated2).toStrictEqual(holder.selection)
    expect(validated1.cas).toBe("validée")
    expect(validated1.ville.id).toBe("c1")
  })

  it("intake narrowing: refuses aucune with DeliveryCityNotFoundError (UserFacingError)", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, null)
    expect(() => holder.selectionValidee()).toThrow(DeliveryCityNotFoundError)
    expect(() => holder.validerSelection()).toThrow(DeliveryCityNotFoundError)
    expect(() => holder.selectionValidee()).toThrow(UserFacingError)
  })

  it("rows derivation: derives rows from carried sousTotal for validated selection", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, "c1")
    expect(holder.rows[0]).toMatchObject({
      label: "Sous-total (TVA incluse)",
      kind: "detail",
    })
    expect(holder.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      kind: "detail",
    })
    expect(holder.rows.find((r) => r.kind === "total")).toBeDefined()
  })

  it("rows derivation: derives rows from carried sousTotal for aucune selection (total omitted)", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, null)
    expect(holder.rows[1]).toMatchObject({
      label: "Livraison",
      value: "À choisir",
      tone: "muted",
    })
    expect(holder.rows.some((r) => r.kind === "total")).toBe(false)
  })

  it("hidden details: quotes and threshold are not accessible through holder", () => {
    const holder = creerDevisHolder(cities, quotes, sousTotal, "c1")
    expect("quotes" in holder).toBe(false)
    expect("threshold" in holder).toBe(false)
    expect((holder as unknown as Record<string, unknown>).quotes).toBeUndefined()
    expect((holder as unknown as Record<string, unknown>).threshold).toBeUndefined()
    expect(holder.villes).toEqual(cities)
  })

  it("immutability: choisir returns a new holder without mutating original", () => {
    const h1 = creerDevisHolder(cities, quotes, sousTotal, "c1")
    const h2 = h1.choisir("c2")
    expect(h1.villeId).toBe("c1")
    expect(h2.villeId).toBe("c2")
    expect(h1).not.toBe(h2)
  })

  it("factory overloads: supports init object and positional arguments", () => {
    const hFromInit = creerDevisHolder({
      cities,
      quotes,
      sousTotal,
      urlVilleId: "c1",
    })
    expect(hFromInit.villeId).toBe("c1")

    const hFromArgs = createDevisHolder(cities, quotes, sousTotal, "c1")
    expect(hFromArgs.villeId).toBe("c1")
  })

  describe("staleness & re-pricing on Panier change", () => {
    it("pins re-pricing after quantity changes (crossing threshold to free shipping)", () => {
      const initial = creerDevisHolder({
        cities,
        sousTotal: 50000,
        threshold: 100000,
        urlVilleId: "c1",
      })
      expect(initial.rows[0].value).toBe(formatPrice(50000))
      expect(initial.rows[1]).toMatchObject({
        label: "Livraison (Casablanca)",
        value: formatPrice(3500),
      })
      expect(initial.rows.find((r) => r.kind === "total")?.value).toBe(
        formatPrice(53500)
      )

      // Re-quantify: quantity doubled, subtotal reaches threshold
      const requantified = initial.recalculer(100000)
      expect(requantified.rows[0].value).toBe(formatPrice(100000))
      expect(requantified.rows[1]).toMatchObject({
        label: "Livraison (Casablanca)",
        value: "Livraison offerte",
        tone: "offered",
      })
      expect(requantified.rows.find((r) => r.kind === "total")?.value).toBe(
        formatPrice(100000)
      )
    })

    it("pins re-pricing after adding an article", () => {
      const initial = creerDevisHolder({
        cities,
        sousTotal: 50000,
        threshold: 100000,
        urlVilleId: "c1",
      })
      const afterAdd = initial.recalculer(80000)
      expect(afterAdd.rows[0].value).toBe(formatPrice(80000))
      expect(afterAdd.rows[1]).toMatchObject({
        label: "Livraison (Casablanca)",
        value: formatPrice(3500),
      })
      expect(afterAdd.rows.find((r) => r.kind === "total")?.value).toBe(
        formatPrice(83500)
      )
    })

    it("pins re-pricing after removing an article (falling below threshold)", () => {
      const initial = creerDevisHolder({
        cities,
        sousTotal: 120000,
        threshold: 100000,
        urlVilleId: "c1",
      })
      expect(initial.rows[1]).toMatchObject({
        value: "Livraison offerte",
        tone: "offered",
      })

      const afterRemove = initial.recalculer(60000)
      expect(afterRemove.rows[0].value).toBe(formatPrice(60000))
      expect(afterRemove.rows[1]).toMatchObject({
        label: "Livraison (Casablanca)",
        value: formatPrice(3500),
      })
      expect(afterRemove.rows.find((r) => r.kind === "total")?.value).toBe(
        formatPrice(63500)
      )
    })
  })
})


