import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  chargerDevis,
  createDevisHolder,
  creerDevisHolder,
  DeliveryCityNotFoundError,
  lignesDevis,
  selectionnerDevis,
  type Devis,
  type DevisHolder,
} from "@/lib/use-cases/devis"
import type { ArticleDuPanier, DonneesPanier } from "@/lib/panier"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison"
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

  it("returns cities, threshold, quotes and selection in one call for a valid ville", async () => {
    const panier = panierPourDevis(50000)

    const devis = selectionValidee(await chargerDevis(panier, "c1"))

    expect(devis.sousTotal).toBe(panier.subtotal)
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
    expect("rows" in devis).toBe(false)
    const rows = lignesDevis(devis.sousTotal, devis)
    expect(rows).toEqual(
      lignesDevis(50000, {
        cas: "validée",
        ville: city("c1", "Casablanca", 3500),
        devis: { subtotal: 50000, shippingFee: 3500, total: 53500 },
      })
    )
    expect(rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      kind: "detail",
    })
    expect(rows.find((row) => row.kind === "total")).toBeDefined()
  })

  it("yields the aucune selection without throwing for an unknown ville (rows derive via lignesDevis)", async () => {
    const panier = panierPourDevis(50000)

    let devis: Awaited<ReturnType<typeof chargerDevis>> | null = null
    await expect(
      (async () => {
        devis = await chargerDevis(panier, "ville-inconnue")
      })()
    ).resolves.not.toThrow()

    expect(devis!.cas).toBe("aucune")
    expect(devis!.sousTotal).toBe(panier.subtotal)
    expect("rows" in devis!).toBe(false)
    const rows = lignesDevis(devis!.sousTotal, devis!)
    expect(rows[1]).toEqual({
      label: "Livraison",
      value: "À choisir",
      kind: "detail",
      tone: "muted",
    })
    expect(rows.some((row) => row.kind === "total")).toBe(false)
    expect(rows).toHaveLength(2)
  })

  it("yields the aucune selection when no ville is requested (rows derive via lignesDevis)", async () => {
    const panier = panierPourDevis(50000)

    for (const requested of [undefined, null] as const) {
      const devis = await chargerDevis(panier, requested)

      expect(devis.cas).toBe("aucune")
      expect(devis.sousTotal).toBe(panier.subtotal)
      expect("rows" in devis).toBe(false)
      const rows = lignesDevis(devis.sousTotal, devis)
      expect(rows[1]).toMatchObject({
        label: "Livraison",
        value: "À choisir",
        tone: "muted",
      })
      expect(rows.some((row) => row.kind === "total")).toBe(false)
    }
  })

  it("renders the offered tone when the threshold is reached or a free-shipping article is present", async () => {
    const panierAuSeuil = panierPourDevis(150000)
    const auSeuil = selectionValidee(await chargerDevis(panierAuSeuil, "c1"))
    expect(auSeuil.sousTotal).toBe(panierAuSeuil.subtotal)
    expect(auSeuil.devis).toMatchObject({ shippingFee: 0 })
    expect(lignesDevis(auSeuil.sousTotal, auSeuil)[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      value: "Livraison offerte",
      tone: "offered",
    })

    const panierOffert = panierPourDevis(50000, [false, true])
    const articleOffert = selectionValidee(
      await chargerDevis(panierOffert, "c2")
    )
    expect(articleOffert.sousTotal).toBe(panierOffert.subtotal)
    expect(articleOffert.devis).toMatchObject({ shippingFee: 0 })
    expect(lignesDevis(articleOffert.sousTotal, articleOffert)[1]).toMatchObject({
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

  it("factory overloads: supports init object and loaded Devis", () => {
    const hFromInit = creerDevisHolder({
      cities,
      quotes,
      sousTotal,
      urlVilleId: "c1",
    })
    expect(hFromInit.villeId).toBe("c1")

    const fakeDevis: Devis = {
      cities,
      quotes,
      threshold: 100000,
      sousTotal,
      cas: "validée",
      ville: cities[0],
      devis: quotes.c1,
    }
    const hFromDevis = createDevisHolder(fakeDevis)
    expect(hFromDevis.villeId).toBe("c1")
  })
})

