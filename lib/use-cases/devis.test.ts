import { beforeEach, describe, expect, it, vi } from "vitest"

import { chargerDevis, DeliveryCityNotFoundError } from "@/lib/use-cases/devis"
import {
  creerDevisHolder,
  selectionnerDevis,
  selectionValidee,
  villeInitiale,
  type DevisChargé,
  type DevisHolder,
  type DevisPrecedenceSources,
} from "@/lib/use-cases/devis-coeur"
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

const city = (
  id: string,
  name: string,
  fee: number,
  slug = `slug-${id}`
): DeliveryCityOption => ({
  id,
  slug,
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

describe("villeInitiale (précédence lien > profil > aucune)", () => {
  it("yields null without sources", () => {
    expect(villeInitiale()).toBeNull()
  })

  it("precedence: lien wins over profil", () => {
    expect(villeInitiale({ urlVilleId: "c1", profileVilleId: "c2" })).toBe("c1")
  })

  it("precedence: absent, empty or whitespace lien falls back to profil", () => {
    for (const urlVilleId of [undefined, null, "", "   "]) {
      expect(villeInitiale({ urlVilleId, profileVilleId: "c2" })).toBe("c2")
    }
  })

  it("precedence: an explicitly provided lien suppresses the profile fallback", () => {
    expect(
      villeInitiale({
        urlVilleId: "ville-inconnue",
        urlVilleFournie: true,
        profileVilleId: "c2",
      })
    ).toBe("ville-inconnue")

    expect(
      villeInitiale({
        urlVilleId: "   ",
        urlVilleFournie: true,
        profileVilleId: "c2",
      })
    ).toBeNull()
  })

  it("precedence: neither source yields null", () => {
    expect(villeInitiale({ urlVilleId: null, profileVilleId: null })).toBeNull()
    expect(villeInitiale({ urlVilleId: "", profileVilleId: "   " })).toBeNull()
    expect(villeInitiale({ urlVilleId: "   " })).toBeNull()
  })

  it("trims the winning identifier", () => {
    expect(villeInitiale({ urlVilleId: "  c1  " })).toBe("c1")
    expect(villeInitiale({ profileVilleId: "  c2  " })).toBe("c2")
  })
})

describe("selectionValidee (rétrécissement de prise en commande)", () => {
  const validée = {
    cas: "validée",
    ville: city("c1", "Casablanca", 3500),
    devis: quote(50000, 3500),
  } as const

  it("returns the validated selection unchanged", () => {
    const rétrécie = selectionValidee(validée)
    expect(rétrécie).toBe(validée)
    expect(rétrécie).toStrictEqual(validée)
  })

  it("raises DeliveryCityNotFoundError (a UserFacingError) for aucune", () => {
    expect(() => selectionValidee(aucune)).toThrow(DeliveryCityNotFoundError)
    expect(() => selectionValidee(aucune)).toThrow(UserFacingError)
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



describe("chargerDevis", () => {
  const villes = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

  beforeEach(() => {
    listDeliveryCitiesMock.mockReset()
    getFreeShippingThresholdMock.mockReset()
    listDeliveryCitiesMock.mockResolvedValue(villes)
    getFreeShippingThresholdMock.mockResolvedValue(100000)
  })

  it("returns plain facts: villes, seuil, devis par ville, sous-total", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000), "c1")

    expect(chargé.cities).toEqual(villes)
    expect(chargé.threshold).toBe(100000)
    expect(chargé.sousTotal).toBe(50000)
    expect(chargé.quotes).toEqual({
      c1: quote(50000, 3500),
      c2: quote(50000, 5000),
    })
    expect(chargé.sources).toEqual({ urlVilleId: "c1" })
  })

  it("carries the precedence sources (url ville winning over profile fallback)", async () => {
    const avecLesDeux = await chargerDevis(panierPourDevis(50000), {
      urlVilleId: "c1",
      profileVilleId: "c2",
    })
    expect(avecLesDeux.sources).toEqual({ urlVilleId: "c1", profileVilleId: "c2" })

    const repliProfil = await chargerDevis(panierPourDevis(50000), {
      urlVilleId: null,
      profileVilleId: "c2",
    })
    expect(repliProfil.sources).toEqual({ urlVilleId: null, profileVilleId: "c2" })
  })

  it("omits sources when none are given and never throws on an unknown ville", async () => {
    const sansSource = await chargerDevis(panierPourDevis(50000))
    expect("sources" in sansSource).toBe(false)

    const villeInconnue = await chargerDevis(panierPourDevis(50000), "ville-inconnue")
    expect(villeInconnue.sources).toEqual({ urlVilleId: "ville-inconnue" })
    expect(villeInconnue.quotes.c1).toEqual(quote(50000, 3500))
  })

  it("prices free delivery when the seuil is reached or a free-shipping article is present", async () => {
    const auSeuil = await chargerDevis(panierPourDevis(150000), "c1")
    expect(auSeuil.quotes.c1).toEqual(quote(150000, 0))

    const articleOffert = await chargerDevis(
      panierPourDevis(50000, [false, true]),
      "c2"
    )
    expect(articleOffert.quotes.c2).toEqual(quote(50000, 0))
  })
})

describe("boundary: le Devis chargé ne traverse la couture qu'en données pures", () => {
  const villes = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

  beforeEach(() => {
    listDeliveryCitiesMock.mockReset()
    getFreeShippingThresholdMock.mockReset()
    listDeliveryCitiesMock.mockResolvedValue(villes)
    getFreeShippingThresholdMock.mockResolvedValue(100000)
  })

  function assertDonnéePure(valeur: unknown, chemin = "$"): void {
    if (
      valeur === null ||
      typeof valeur === "string" ||
      typeof valeur === "number" ||
      typeof valeur === "boolean"
    ) {
      return
    }
    if (typeof valeur === "function") {
      throw new Error(`fonction à ${chemin} — la donnée pure n'en porte pas`)
    }
    if (Array.isArray(valeur)) {
      valeur.forEach((élément, index) =>
        assertDonnéePure(élément, `${chemin}[${index}]`)
      )
      return
    }
    if (typeof valeur === "object") {
      const prototype = Object.getPrototypeOf(valeur)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(
          `instance de classe à ${chemin} — la donnée pure n'en porte pas`
        )
      }
      for (const [clé, descripteur] of Object.entries(
        Object.getOwnPropertyDescriptors(valeur)
      )) {
        if (typeof descripteur.get === "function") {
          throw new Error(
            `getter à ${chemin}.${clé} — la donnée pure n'en porte pas`
          )
        }
        assertDonnéePure(descripteur.value, `${chemin}.${clé}`)
      }
      return
    }
    throw new Error(`donnée impure à ${chemin} (${typeof valeur})`)
  }

  it("chargerDevis output is strictly plain data", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000), {
      urlVilleId: "c1",
      profileVilleId: null,
    })
    expect(() => assertDonnéePure(chargé)).not.toThrow()
  })

  it("a function member fails the walk", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000))
    expect(() => assertDonnéePure({ ...chargé, choisir: () => chargé })).toThrow(
      /fonction/
    )
  })

  it("a getter member fails the walk", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000))
    expect(() =>
      assertDonnéePure({
        ...chargé,
        get total() {
          return chargé.sousTotal
        },
      })
    ).toThrow(/getter à/)
  })

  it("a class instance fails the walk", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000))
    class Instance {}
    expect(() =>
      assertDonnéePure({ ...chargé, étiquette: new Instance() })
    ).toThrow(/instance de classe/)
  })
})

describe("DevisHolder", () => {
  const sousTotal = 50000

  const chargé = (sources?: DevisPrecedenceSources): DevisChargé => ({
    cities,
    threshold: 100000,
    quotes,
    sousTotal,
    ...(sources === undefined ? {} : { sources }),
  })

  it("precedence: url ville wins over profile fallback on initial creation", () => {
    const holder = creerDevisHolder(
      chargé({ urlVilleId: "c1", profileVilleId: "c2" })
    )
    expect(holder.villeId).toBe("c1")
    expect(holder.selection.cas).toBe("validée")
    if (holder.selection.cas === "validée") {
      expect(holder.selection.ville.id).toBe("c1")
    }
  })

  it("precedence: saved profile fallback is chosen when url ville is absent, empty, or whitespace", () => {
    for (const urlVilleId of [undefined, null, "", "   "]) {
      const holder = creerDevisHolder(chargé({ urlVilleId, profileVilleId: "c2" }))
      expect(holder.villeId).toBe("c2")
      expect(holder.selection.cas).toBe("validée")
      if (holder.selection.cas === "validée") {
        expect(holder.selection.ville.id).toBe("c2")
      }
    }
  })

  it("precedence: an explicit url presence suppresses the profile fallback for an unknown ville", () => {
    const inconnue = creerDevisHolder(
      chargé({
        urlVilleId: "ville-inconnue",
        urlVilleFournie: true,
        profileVilleId: "c2",
      })
    )
    expect(inconnue.villeId).toBeNull()
    expect(inconnue.selection.cas).toBe("aucune")

    const vide = creerDevisHolder(
      chargé({
        urlVilleId: "   ",
        urlVilleFournie: true,
        profileVilleId: "c2",
      })
    )
    expect(vide.villeId).toBeNull()
    expect(vide.selection.cas).toBe("aucune")
  })

  it("precedence: resolves to aucune when both url and profile are absent or empty", () => {
    const holder = creerDevisHolder(
      chargé({ urlVilleId: null, profileVilleId: null })
    )
    expect(holder.villeId).toBeNull()
    expect(holder.selection.cas).toBe("aucune")
  })

  it("precedence: local choice wins over both url and profile after choisir", () => {
    const holder = creerDevisHolder(
      chargé({ urlVilleId: "c1", profileVilleId: "c2" })
    )
    expect(holder.villeId).toBe("c1")

    const chosenC2 = holder.choisir("c2")
    expect(chosenC2.villeId).toBe("c2")

    const chosenC1 = chosenC2.choisir("c1")
    expect(chosenC1.villeId).toBe("c1")

    const chosenAucune = chosenC1.choisir(null)
    expect(chosenAucune.villeId).toBeNull()
    expect(chosenAucune.selection.cas).toBe("aucune")
  })

  it("quotes are always supplied by the caller — the factory never prices", () => {
    const sansDevis = creerDevisHolder({
      cities,
      threshold: 100000,
      quotes: {},
      sousTotal,
      sources: { urlVilleId: "c1" },
    })
    expect(sansDevis.selection.cas).toBe("aucune")
    expect(sansDevis.villeId).toBeNull()
    expect(sansDevis.rows[1]).toMatchObject({
      label: "Livraison",
      value: "À choisir",
      tone: "muted",
    })
    expect(sansDevis.rows.some((r) => r.kind === "total")).toBe(false)
  })

  it("fallback: unknown ville silently resolves to aucune without throwing", () => {
    let holderFromUnknown: DevisHolder | null = null
    expect(() => {
      holderFromUnknown = creerDevisHolder(
        chargé({ urlVilleId: "ville-inconnue" })
      )
    }).not.toThrow()
    expect(holderFromUnknown!.villeId).toBeNull()
    expect(holderFromUnknown!.selection.cas).toBe("aucune")

    const validHolder = creerDevisHolder(chargé({ urlVilleId: "c1" }))
    const choseUnknown = validHolder.choisir("ville-inconnue")
    expect(choseUnknown.villeId).toBeNull()
    expect(choseUnknown.selection.cas).toBe("aucune")
  })

  it("intake narrowing: selectionValidee returns validated selection when valid", () => {
    const holder = creerDevisHolder(chargé({ urlVilleId: "c1" }))
    const validated1 = holder.selectionValidee()
    expect(validated1).toStrictEqual(holder.selection)
    expect(validated1.cas).toBe("validée")
    expect(validated1.ville.id).toBe("c1")
  })

  it("intake narrowing: refuses aucune with DeliveryCityNotFoundError (UserFacingError)", () => {
    const holder = creerDevisHolder(chargé({ urlVilleId: null }))
    expect(() => holder.selectionValidee()).toThrow(DeliveryCityNotFoundError)
    expect(() => holder.selectionValidee()).toThrow(UserFacingError)
  })

  it("rows derivation: derives rows from carried sousTotal for validated selection", () => {
    const holder = creerDevisHolder(chargé({ urlVilleId: "c1" }))
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
    const holder = creerDevisHolder(chargé({ urlVilleId: null }))
    expect(holder.rows[1]).toMatchObject({
      label: "Livraison",
      value: "À choisir",
      tone: "muted",
    })
    expect(holder.rows.some((r) => r.kind === "total")).toBe(false)
  })

  it("immutability: choisir returns a new holder without mutating original", () => {
    const h1 = creerDevisHolder(chargé({ urlVilleId: "c1" }))
    const h2 = h1.choisir("c2")
    expect(h1.villeId).toBe("c1")
    expect(h2.villeId).toBe("c2")
    expect(h1).not.toBe(h2)
  })
})


