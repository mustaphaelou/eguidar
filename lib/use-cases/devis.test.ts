import { beforeEach, describe, expect, it, vi } from "vitest"

import { chargerDevis, DeliveryCityNotFoundError } from "@/lib/use-cases/devis"
import {
  projeterDevis,
  selectionValidee,
  type DevisChargé,
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

const chargé = (overrides: Partial<DevisChargé> = {}): DevisChargé => ({
  cities,
  threshold: 100000,
  quotes,
  sousTotal: 73000,
  villeInitiale: null,
  ...overrides,
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

describe("chargerDevis (porte la Précédence : Ville initiale résolue une seule fois)", () => {
  const villes = [city("c1", "Casablanca", 3500), city("c2", "Rabat", 5000)]

  beforeEach(() => {
    listDeliveryCitiesMock.mockReset()
    getFreeShippingThresholdMock.mockReset()
    listDeliveryCitiesMock.mockResolvedValue(villes)
    getFreeShippingThresholdMock.mockResolvedValue(100000)
  })

  it("returns plain facts: villes, seuil, devis par ville, sous-total, Ville initiale", async () => {
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
    expect(chargé.villeInitiale).toBe("c1")
  })

  it("resolves the URL's ville internally: slug wins, then the legacy id alias", async () => {
    const parSlug = await chargerDevis(panierPourDevis(50000), {
      villeParam: "slug-c2",
    })
    expect(parSlug.villeInitiale).toBe("c2")

    const parAlias = await chargerDevis(panierPourDevis(50000), {
      villeParam: "c1",
    })
    expect(parAlias.villeInitiale).toBe("c1")
  })

  it("precedence: the link beats the profile", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000), {
      villeParam: "slug-c1",
      profileVilleId: "c2",
    })

    expect(chargé.villeInitiale).toBe("c1")
    expect(projeterDevis(chargé, chargé.villeInitiale).villeId).toBe("c1")
  })

  it("precedence: an absent or blank link falls back to the profile, whose id is trimmed once here", async () => {
    for (const villeParam of [undefined, null, "", "   "] as const) {
      const chargé = await chargerDevis(panierPourDevis(50000), {
        villeParam,
        profileVilleId: "c2",
      })
      expect(chargé.villeInitiale).toBe("c2")
    }

    const auProfil = await chargerDevis(panierPourDevis(50000), {
      profileVilleId: "c2",
    })
    expect(auProfil.villeInitiale).toBe("c2")
    expect(projeterDevis(auProfil, auProfil.villeInitiale).villeId).toBe("c2")

    const espaces = await chargerDevis(panierPourDevis(50000), {
      profileVilleId: "  c2  ",
    })
    expect(espaces.villeInitiale).toBe("c2")
    expect(projeterDevis(espaces, espaces.villeInitiale).villeId).toBe("c2")
  })

  it("precedence: an unknown link suppresses the profile fallback — Ville initiale null, sélection « aucune »", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000), {
      villeParam: "ville-inconnue",
      profileVilleId: "c2",
    })

    expect(chargé.villeInitiale).toBeNull()
    expect(
      projeterDevis(chargé, chargé.villeInitiale).selection
    ).toStrictEqual(aucune)
    expect(chargé.quotes.c1).toEqual(quote(50000, 3500))
  })

  it("precedence: neither a link nor a usable profile yields null", async () => {
    const sansLien = await chargerDevis(panierPourDevis(50000), {
      villeParam: undefined,
      profileVilleId: null,
    })
    expect(sansLien.villeInitiale).toBeNull()

    const profilBlanc = await chargerDevis(panierPourDevis(50000), {
      villeParam: null,
      profileVilleId: "   ",
    })
    expect(profilBlanc.villeInitiale).toBeNull()

    const faitsVides = await chargerDevis(panierPourDevis(50000), {})
    expect(faitsVides.villeInitiale).toBeNull()
  })

  it("yields villeInitiale null when no facts are handed over", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000))
    expect(chargé.villeInitiale).toBeNull()
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

  it("chargerDevis output is strictly plain data, Ville initiale fact included", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000), {
      villeParam: "slug-c1",
      profileVilleId: null,
    })
    expect(chargé.villeInitiale).toBe("c1")
    expect(() => assertDonnéePure(chargé)).not.toThrow()
  })

  it("a function member fails the walk", async () => {
    const chargé = await chargerDevis(panierPourDevis(50000))
    expect(chargé.villeInitiale).toBeNull()
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

  it("cas aucune (null, vide, espaces, inconnu) : sélection aucune, aucun identifiant, ligne à choisir, total omis", () => {
    for (const villeId of [null, "", "   ", "ville-inconnue"] as const) {
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
      villeInitiale: null,
    }

    expect(() => projeterDevis(vide, "c1")).not.toThrow()
    const projet = projeterDevis(vide, null)
    expect(projet.villes).toStrictEqual([])
    expect(projet.selection).toStrictEqual({ cas: "aucune" })
    expect(projet.villeId).toBeNull()
    expect(projet.rows.some((row) => row.kind === "total")).toBe(false)
  })

  describe("coutures internes privées : leurs anciens cas passent par le projecteur", () => {
    it("identifiant absent de l'appelant → « aucune » typée `null` (paramètre requis)", () => {
      const projet = projeterDevis(chargé(), null)

      expect(projet.selection).toStrictEqual(aucune)
      expect(projet.villeId).toBeNull()
      expect(projet.rows[1]).toMatchObject({
        label: "Livraison",
        value: "À choisir",
        tone: "muted",
      })
      expect(projet.rows.some((row) => row.kind === "total")).toBe(false)
    })

    it("ville connue sans devis → « aucune », jamais à moitié", () => {
      const sansDevis = chargé({ quotes: { c1: quote(50000, 3500) } })
      const projet = projeterDevis(sansDevis, "c2")

      expect(projet.selection).toStrictEqual(aucune)
      expect(projet.villeId).toBeNull()
      expect(projet.rows.some((row) => row.kind === "total")).toBe(false)
    })

    it("devis sans son objet ville → « aucune », jamais à moitié", () => {
      const sansVille = chargé({ cities: [city("c1", "Casablanca", 3500)] })
      const projet = projeterDevis(sansVille, "c2")

      expect(projet.selection).toStrictEqual(aucune)
      expect(projet.villeId).toBeNull()
    })

    it("indépendant du prix : devis offert et facturé sélectionnent la même ville, la ligne Livraison suit", () => {
      const offert = chargé({
        quotes: { c1: quote(50000, 0), c2: quote(50000, 0) },
      })

      const projetOffert = projeterDevis(offert, "c1")
      expect(projetOffert.selection).toStrictEqual({
        cas: "validée",
        ville: city("c1", "Casablanca", 3500),
        devis: quote(50000, 0),
      })
      expect(projetOffert.rows[1]).toStrictEqual({
        label: "Livraison (Casablanca)",
        value: "Livraison offerte",
        kind: "detail",
        tone: "offered",
      })

      const projetFacturé = projeterDevis(chargé(), "c1")
      expect(projetFacturé.selection).toStrictEqual({
        cas: "validée",
        ville: city("c1", "Casablanca", 3500),
        devis: quote(50000, 3500),
      })
      expect(projetFacturé.rows[1]).toStrictEqual({
        label: "Livraison (Casablanca)",
        value: formatPrice(3500),
        kind: "detail",
      })
    })

    it("idempotent : projeter deux fois les mêmes entrées rend la même chose, refus compris", () => {
      const valide1 = projeterDevis(chargé(), "c1")
      const valide2 = projeterDevis(chargé(), "c1")
      expect(valide1.selection).toStrictEqual({
        cas: "validée",
        ville: city("c1", "Casablanca", 3500),
        devis: quote(50000, 3500),
      })
      expect(valide2.selection).toStrictEqual(valide1.selection)
      expect(valide2.rows).toStrictEqual(valide1.rows)

      const refus1 = projeterDevis(chargé(), "ville-inconnue")
      const refus2 = projeterDevis(chargé(), "ville-inconnue")
      expect(refus1.selection).toStrictEqual(aucune)
      expect(refus2.selection).toStrictEqual(refus1.selection)
      expect(refus2.rows).toStrictEqual(refus1.rows)
    })
  })
})

describe("projeterDevis: la Ville explicite est la seule entrée — la Ville initiale portée ne se dérive pas", () => {
  it("une ville valide projetée rend sélection, lignes et rétrécissement validé", () => {
    const projet = projeterDevis(chargé(), "c1")

    expect(projet.villeId).toBe("c1")
    expect(projet.selection).toStrictEqual({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: quote(50000, 3500),
    })
    expect(selectionValidee(projet.selection).ville.id).toBe("c1")
    expect(projet.rows[1]).toMatchObject({
      label: "Livraison (Casablanca)",
      kind: "detail",
    })
  })

  it("une ville inconnue projetée rend « aucune » et le rétrécissement refuse", () => {
    const projet = projeterDevis(
      chargé({ villeInitiale: "c1" }),
      "ville-inconnue"
    )

    expect(projet.selection).toStrictEqual({ cas: "aucune" })
    expect(projet.villeId).toBeNull()
    expect(() => selectionValidee(projet.selection)).toThrow(
      DeliveryCityNotFoundError
    )
  })

  it("une ville explicite l'emporte sur la Ville initiale portée (ville soumise)", () => {
    const projet = projeterDevis(chargé({ villeInitiale: "c1" }), "c2")

    expect(projet.villeId).toBe("c2")
    expect(projet.selection).toStrictEqual({
      cas: "validée",
      ville: city("c2", "Rabat", 5000),
      devis: quote(50000, 5000),
    })
  })

  it("« aucune » typée et chaîne vide explicites restent « aucune » même avec une Ville initiale portée", () => {
    const devisChargé = chargé({ villeInitiale: "c1" })

    const typée = projeterDevis(devisChargé, null)
    expect(typée.selection).toStrictEqual({ cas: "aucune" })
    expect(typée.villeId).toBeNull()

    const vide = projeterDevis(devisChargé, "")
    expect(vide.selection).toStrictEqual({ cas: "aucune" })
    expect(vide.villeId).toBeNull()
  })

  it("projeter la Ville initiale portée elle-même rend la ville du lien (recette du Panier)", () => {
    const devisChargé = chargé({ villeInitiale: "c1" })
    const projet = projeterDevis(devisChargé, devisChargé.villeInitiale)

    expect(projet.villeId).toBe("c1")
    expect(projet.selection).toStrictEqual({
      cas: "validée",
      ville: city("c1", "Casablanca", 3500),
      devis: quote(50000, 3500),
    })
  })
})


