import { describe, expect, expectTypeOf, it } from "vitest"

import {
  projeterCarteProduit,
  urlProduit,
  type CarteProduit,
  type FaitsCarteProduit,
} from "@/lib/carte-produit"

/**
 * Suite pure de la Carte produit : les faits qu'un jeu d'entrées projette,
 * la décision de masquage et le chemin écrit — aucune base, aucun fixture
 * Prisma. Les métriques arrivent cuites : `product-metrics.ts` les calcule,
 * la projection les recopie.
 */
type FaitsComplets = FaitsCarteProduit & {
  totalStock: number
  freeShipping: boolean
}

function makeFaits(overrides: Partial<FaitsComplets> = {}): FaitsComplets {
  return {
    id: "p-1",
    name: "Chaise Test",
    slug: "chaise-test",
    brand: "Marque Test",
    images: ["https://example.com/une.jpg", "https://example.com/deux.jpg"],
    minPrice: 80000,
    totalStock: 10,
    freeShipping: true,
    ...overrides,
  }
}

/**
 * Les six faits d'une Suggestion de produit : ni le stock total ni la
 * Livraison offerte ne sont connus de ce chemin de lecture.
 */
function makeFaitsSansMetriques(): FaitsCarteProduit {
  return {
    id: "p-1",
    name: "Chaise Test",
    slug: "chaise-test",
    brand: "Marque Test",
    images: ["https://example.com/une.jpg"],
    minPrice: 80000,
  }
}

describe("projeterCarteProduit", () => {
  it("recopie les faits d'identité et les métriques cuites", () => {
    const carte = projeterCarteProduit(makeFaits(), { rupture: "montrer" })

    expect(carte).toEqual({
      id: "p-1",
      name: "Chaise Test",
      slug: "chaise-test",
      brand: "Marque Test",
      image: "https://example.com/une.jpg",
      minPrice: 80000,
      totalStock: 10,
      freeShipping: true,
    })
  })

  it("retient la première image, jamais la suivante", () => {
    const carte = projeterCarteProduit(
      makeFaits({
        images: [
          "https://example.com/premiere.jpg",
          "https://example.com/seconde.jpg",
        ],
      }),
      { rupture: "montrer" }
    )

    expect(carte.image).toBe("https://example.com/premiere.jpg")
  })

  it("répond une image nulle sans image exploitable", () => {
    const sansImage = projeterCarteProduit(makeFaits({ images: [] }), {
      rupture: "montrer",
    })
    const imagesInvalides = projeterCarteProduit(makeFaits({ images: null }), {
      rupture: "montrer",
    })

    expect(sansImage.image).toBeNull()
    expect(imagesInvalides.image).toBeNull()
  })

  it("« masquer » retire une Carte produit en rupture de stock (#164)", () => {
    const carte = projeterCarteProduit(makeFaits({ totalStock: 0 }), {
      rupture: "masquer",
    })

    expect(carte).toBeNull()
  })

  it("« masquer » laisse passer un Produit disponible", () => {
    const carte = projeterCarteProduit(makeFaits(), { rupture: "masquer" })

    expect(carte?.slug).toBe("chaise-test")
    expect(carte?.totalStock).toBe(10)
  })

  it("« masquer » ne masque jamais un stock total inconnu", () => {
    const carte = projeterCarteProduit(makeFaitsSansMetriques(), {
      rupture: "masquer",
    })

    expect(carte).not.toBeNull()
    expect(carte?.slug).toBe("chaise-test")
  })

  it("« montrer » exige les deux métriques", () => {
    const faits = makeFaitsSansMetriques()

    // Verrou de compilation : la ligne suivante ne compile que si l'overload
    // « montrer » exige `totalStock` et `freeShipping`. Si l'exigence tombe,
    // la directive devient inutile et `tsc --noEmit` échoue.
    // @ts-expect-error — « montrer » exige les deux métriques
    const carte = projeterCarteProduit(faits, { rupture: "montrer" })

    expect(carte?.slug).toBe("chaise-test")
  })

  it("ignore une image qui n'est pas une chaîne", () => {
    const carte = projeterCarteProduit(
      makeFaits({ images: [42, "https://example.com/valide.jpg"] }),
      { rupture: "montrer" }
    )

    expect(carte.image).toBe("https://example.com/valide.jpg")
  })

  it("« montrer » ne répond jamais null, même en rupture de stock", () => {
    const carte = projeterCarteProduit(makeFaits({ totalStock: 0 }), {
      rupture: "montrer",
    })

    expect(carte).not.toBeNull()
    expect(carte.totalStock).toBe(0)
  })

  it("rétrécit le retour selon le masquage demandé", () => {
    const faits = makeFaits()

    expectTypeOf(
      projeterCarteProduit(faits, { rupture: "montrer" })
    ).toEqualTypeOf<CarteProduit>()
    expectTypeOf(
      projeterCarteProduit(faits, { rupture: "masquer" })
    ).toEqualTypeOf<CarteProduit | null>()
  })
})

describe("urlProduit", () => {
  it("écrit le chemin relatif de la page Produit", () => {
    expect(urlProduit("chaise-test")).toBe("/produit/chaise-test")
  })

  it("n'ajoute ni origine, ni requête, ni fragment", () => {
    const url = urlProduit("chaise-test")

    expect(url.startsWith("/produit/")).toBe(true)
    expect(url).not.toMatch(/^https?:/)
    expect(url).not.toMatch(/[?#]/)
  })
})
