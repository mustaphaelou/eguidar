import { beforeEach, describe, expect, it, vi } from "vitest"

import { chargerDevis, DeliveryCityNotFoundError } from "@/lib/use-cases/devis"
import {
  projeterDevis,
  resoudreVilleUrl,
  selectionnerDevis,
  selectionValidee,
  villeInitiale,
  type DevisChargé,
  type DevisPrecedenceSources,
} from "@/lib/use-cases/devis-coeur"
import { formatPrice } from "@/lib/money"
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



describe("resoudreVilleUrl (langage d'URL de la Ville : slug puis alias)", () => {
  it("resolves the slug first", () => {
    expect(resoudreVilleUrl(cities, "slug-c1")).toBe("c1")
  })

  it("resolves the legacy internal identifier as a read-only alias", () => {
    expect(resoudreVilleUrl(cities, "c2")).toBe("c2")
  })

  it("prefers a slug over another city's id alias", () => {
    const collision = [
      city("c1", "Casablanca", 3500, "c2"),
      city("c2", "Rabat", 5000),
    ]

    expect(resoudreVilleUrl(collision, "c2")).toBe("c1")
  })

  it("yields null for absent, blank or unknown values", () => {
    for (const villeParam of [
      undefined,
      null,
      "",
      "   ",
      "ville-inconnue",
    ] as const) {
      expect(resoudreVilleUrl(cities, villeParam)).toBeNull()
    }
  })

  it("trims the requested value", () => {
    expect(resoudreVilleUrl(cities, "  slug-c1  ")).toBe("c1")
    expect(resoudreVilleUrl(cities, "  c2  ")).toBe("c2")
  })
})

describe("chargerDevis (faits bruts et sources construites au module)", () => {
  const villes = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

  beforeEach(() => {
    listDeliveryCitiesMock.mockReset()
    getFreeShippingThresholdMock.mockReset()
    listDeliveryCitiesMock.mockResolvedValue(villes)
    getFreeShippingThresholdMock.mockResolvedValue(100000)
  })

  it("returns plain facts: villes, seuil, devis par ville, sous-total", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000), {
      villeParam: "slug-c1",
      profileVilleId: null,
    })

    expect(chargé.cities).toEqual(villes)
    expect(chargé.threshold).toBe(100000)
    expect(chargé.sousTotal).toBe(50000)
    expect(chargé.quotes).toEqual({
      c1: quote(50000, 3500),
      c2: quote(50000, 5000),
    })
    expect(chargé.sources).toEqual({
      urlVilleId: "c1",
      urlVilleFournie: true,
      profileVilleId: null,
    })
  })

  it("resolves the URL's ville internally: slug wins, then the legacy id alias", async () => {
    const parSlug = await chargerDevis(panierPourDevis(50000), {
      villeParam: "slug-c2",
    })
    expect(parSlug.sources).toEqual({
      urlVilleId: "c2",
      urlVilleFournie: true,
      profileVilleId: null,
    })

    const parAlias = await chargerDevis(panierPourDevis(50000), {
      villeParam: "c1",
    })
    expect(parAlias.sources).toEqual({
      urlVilleId: "c1",
      urlVilleFournie: true,
      profileVilleId: null,
    })
  })

  it("carries the profile fact without resolving it, only when the lien names none", async () => {
    const auProfil = await chargerDevis(panierPourDevis(50000), {
      profileVilleId: "c2",
    })
    expect(auProfil.sources).toEqual({
      urlVilleId: null,
      urlVilleFournie: false,
      profileVilleId: "c2",
    })
    expect(projeterDevis(auProfil).villeId).toBe("c2")

    for (const villeParam of ["", "   "] as const) {
      const lienBlanc = await chargerDevis(panierPourDevis(50000), {
        villeParam,
        profileVilleId: "c2",
      })
      expect(lienBlanc.sources).toEqual({
        urlVilleId: null,
        urlVilleFournie: false,
        profileVilleId: "c2",
      })
    }
  })

  it("keeps an unknown lien explicit: fourni stays true and the profile never stands in", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000), {
      villeParam: "ville-inconnue",
      profileVilleId: "c2",
    })

    expect(chargé.sources).toEqual({
      urlVilleId: null,
      urlVilleFournie: true,
      profileVilleId: "c2",
    })
    expect(projeterDevis(chargé).selection).toStrictEqual(aucune)
    expect(chargé.quotes.c1).toEqual(quote(50000, 3500))
  })

  it("omits sources when no facts are handed over", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000))
    expect("sources" in chargé).toBe(false)
  })

  it("prices free delivery when the seuil is reached or a free-shipping article is present", async () => {
    const auSeuil = await chargerDevis(panierPourDevis(150000), {
      villeParam: "slug-c1",
    })
    expect(auSeuil.quotes.c1).toEqual(quote(150000, 0))

    const articleOffert = await chargerDevis(
      panierPourDevis(50000, [false, true]),
      { villeParam: "slug-c2" }
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
      villeParam: "slug-c1",
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

describe("projeterDevis: le Devis projeté, surface externe du cœur", () => {
  const sousTotal = 73000

  const chargé = (overrides: Partial<DevisChargé> = {}): DevisChargé => ({
    cities,
    threshold: 100000,
    quotes,
    sousTotal,
    ...overrides,
  })

  it("ville validée : rend les villes, la sélection, les lignes et l'identifiant", () => {
    const projet = projeterDevis(chargé(), "c1")

    expect(projet.villes).toStrictEqual(cities)
    expect(projet.selection).toStrictEqual({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: quote(50000, 3500),
    })
    expect(projet.villeId).toBe("c1")
    expect(projet.rows[0]).toMatchObject({
      label: "Sous-total (TVA incluse)",
      kind: "detail",
    })
    expect(projet.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      kind: "detail",
    })
    expect(projet.rows.some((row) => row.kind === "total")).toBe(true)
  })

  it("cas aucune (undefined, null, vide, inconnu) : sélection aucune, aucun identifiant, ligne à choisir, total omis", () => {
    for (const villeId of [
      undefined,
      null,
      "",
      "   ",
      "ville-inconnue",
    ] as const) {
      const projet = projeterDevis(chargé(), villeId)

      expect(projet.selection).toStrictEqual({ cas: "aucune" })
      expect(projet.villeId).toBeNull()
      expect(projet.rows[1]).toMatchObject({
        label: "Livraison",
        value: "À choisir",
        tone: "muted",
      })
      expect(projet.rows.some((row) => row.kind === "total")).toBe(false)
    }
  })

  it("« c1 » entouré d'espaces sélectionne Casablanca (normalisation)", () => {
    const projet = projeterDevis(chargé(), "  c1  ")

    expect(projet.selection).toStrictEqual({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: quote(50000, 3500),
    })
    expect(projet.villeId).toBe("c1")
  })

  it("rows derive from the carried sousTotal, not from a quote subtotal", () => {
    const projet = projeterDevis(chargé({ sousTotal: 123456 }), "c1")

    expect(projet.rows[0]).toMatchObject({
      label: "Sous-total (TVA incluse)",
      value: formatPrice(123456),
    })
    expect(projet.rows[1]?.value).toBe(formatPrice(3500))
  })

  it("never throws on empty cities and quotes", () => {
    const vide: DevisChargé = {
      cities: [],
      threshold: 100000,
      quotes: {},
      sousTotal: 0,
    }

    expect(() => projeterDevis(vide, "c1")).not.toThrow()
    const projet = projeterDevis(vide)
    expect(projet.villes).toStrictEqual([])
    expect(projet.selection).toStrictEqual({ cas: "aucune" })
    expect(projet.villeId).toBeNull()
    expect(projet.rows.some((row) => row.kind === "total")).toBe(false)
  })
})

describe("projeterDevis: la précédence absorbée, lignes et rétrécissement par une seule surface", () => {
  const sousTotal = 73000

  const chargéAvec = (sources: DevisPrecedenceSources): DevisChargé => ({
    cities,
    threshold: 100000,
    quotes,
    sousTotal,
    sources,
  })

  it("sans ville explicite, la précédence portée se dérive : le lien l'emporte, la projection rend Casablanca", () => {
    const chargé = chargéAvec({ urlVilleId: "c1", profileVilleId: "c2" })
    const projet = projeterDevis(chargé)

    expect(projet.villeId).toBe("c1")
    expect(projet.selection).toStrictEqual({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: quote(50000, 3500),
    })
  })

  it("sans ville explicite, un lien vide ou absent retombe sur le profil, et la projection rend Rabat", () => {
    for (const urlVilleId of [undefined, null, "", "   "]) {
      const chargé = chargéAvec({ urlVilleId, profileVilleId: "c2" })
      const projet = projeterDevis(chargé)

      expect(projet.villeId).toBe("c2")
    }
  })

  it("sans ville explicite ni source, la projection rend « aucune », sans identifiant ni total", () => {
    const chargé = chargéAvec({ urlVilleId: null, profileVilleId: null })
    const projet = projeterDevis(chargé)

    expect(projet.selection).toStrictEqual({ cas: "aucune" })
    expect(projet.villeId).toBeNull()
    expect(projet.rows[1]).toMatchObject({
      label: "Livraison",
      value: "À choisir",
      tone: "muted",
    })
    expect(projet.rows.some((row) => row.kind === "total")).toBe(false)
  })

  it("sans ville explicite, un lien explicitement inconnu rend « aucune » et le rétrécissement refuse", () => {
    const chargé = chargéAvec({
      urlVilleId: "ville-inconnue",
      urlVilleFournie: true,
    })
    const projet = projeterDevis(chargé)

    expect(projet.selection).toStrictEqual({ cas: "aucune" })
    expect(() => selectionValidee(projet.selection)).toThrow(
      DeliveryCityNotFoundError
    )
  })

  it("une ville valide se rétrécit en sa ville via la projection", () => {
    const chargé = chargéAvec({ urlVilleId: "c1" })
    const projet = projeterDevis(chargé)

    expect(selectionValidee(projet.selection).ville.id).toBe("c1")
  })

  it("une ville explicite l'emporte sur les sources portées (ville soumise)", () => {
    const chargé = chargéAvec({ urlVilleId: "c1", profileVilleId: "c2" })
    const projet = projeterDevis(chargé, "c2")

    expect(projet.villeId).toBe("c2")
    expect(projet.selection).toStrictEqual({
      cas: "validée",
      ville: city("c2", "Rabat", 5000),
      devis: quote(50000, 5000),
    })
  })

  it("« aucune » typée et chaîne vide explicites restent « aucune » même avec des sources", () => {
    const chargé = chargéAvec({ urlVilleId: "c1", profileVilleId: "c2" })

    const typée = projeterDevis(chargé, null)
    expect(typée.selection).toStrictEqual({ cas: "aucune" })
    expect(typée.villeId).toBeNull()

    const vide = projeterDevis(chargé, "")
    expect(vide.selection).toStrictEqual({ cas: "aucune" })
    expect(vide.villeId).toBeNull()
  })
})


