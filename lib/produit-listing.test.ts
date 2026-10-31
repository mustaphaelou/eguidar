import { describe, expect, it } from "vitest"

import {
  buildProduitListingUrl,
  PRODUIT_LISTING_PAGE_DEFAULT,
  PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
  PRODUIT_LISTING_SENS_DEFAULT,
  PRODUIT_LISTING_TRI_DEFAULT,
  PRODUIT_STRUCTURE_SANS,
  PRODUIT_STOCK_NON_NUL,
  PRODUIT_STOCK_ZERO,
  parseProduitListingParams,
  type ProduitListingParams,
} from "@/lib/produit-listing"

function rawFromUrl(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "https://eguidar.test").searchParams)
}

describe("parseProduitListingParams", () => {
  it("maps a fully valid query", () => {
    expect(
      parseProduitListingParams({
        q: " chaise ",
        structure: "categorie-1",
        misEnAvant: "1",
        livraisonOfferte: "1",
        stock: PRODUIT_STOCK_ZERO,
        page: "3",
        pageSize: "20",
        tri: "prix",
        sens: "asc",
      })
    ).toEqual({
      q: "chaise",
      structure: "categorie-1",
      misEnAvant: true,
      livraisonOfferte: true,
      stock: PRODUIT_STOCK_ZERO,
      tri: "prix",
      sens: "asc",
      page: 3,
      pageSize: 20,
    })
  })

  it("keeps the reserved sans-Structure token and the non-zero stock token", () => {
    expect(
      parseProduitListingParams({
        structure: PRODUIT_STRUCTURE_SANS,
        stock: PRODUIT_STOCK_NON_NUL,
      })
    ).toMatchObject({
      structure: PRODUIT_STRUCTURE_SANS,
      stock: PRODUIT_STOCK_NON_NUL,
    })
  })

  it("falls back per rule on invalid scalar values", () => {
    for (const badPage of ["-4", "0", "abc", "2.5", ""]) {
      expect(parseProduitListingParams({ page: badPage }).page).toBe(
        PRODUIT_LISTING_PAGE_DEFAULT
      )
    }
    expect(parseProduitListingParams({ pageSize: "35" }).pageSize).toBe(
      PRODUIT_LISTING_PAGE_SIZE_DEFAULT
    )
    expect(parseProduitListingParams({ pageSize: "abc" }).pageSize).toBe(
      PRODUIT_LISTING_PAGE_SIZE_DEFAULT
    )
    expect(parseProduitListingParams({ pageSize: "20" }).pageSize).toBe(20)
    expect(parseProduitListingParams({ tri: "poids" }).tri).toBe(
      PRODUIT_LISTING_TRI_DEFAULT
    )
    expect(parseProduitListingParams({ sens: "upward" }).sens).toBe(
      PRODUIT_LISTING_SENS_DEFAULT
    )
    for (const bad of ["oui", "true", "0", "", "2"]) {
      expect(parseProduitListingParams({ misEnAvant: bad }).misEnAvant).toBe(
        undefined
      )
      expect(
        parseProduitListingParams({ livraisonOfferte: bad }).livraisonOfferte
      ).toBe(undefined)
    }
    for (const badStock of ["low", "0", "nonzero", ""]) {
      expect(parseProduitListingParams({ stock: badStock }).stock).toBe(
        undefined
      )
    }
  })

  it("returns pure defaults on empty input", () => {
    expect(parseProduitListingParams({})).toEqual({
      tri: PRODUIT_LISTING_TRI_DEFAULT,
      sens: PRODUIT_LISTING_SENS_DEFAULT,
      page: PRODUIT_LISTING_PAGE_DEFAULT,
      pageSize: PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
    })
  })

  it("defaults the product list to fifty rows, unlike the orders list", () => {
    expect(PRODUIT_LISTING_PAGE_DEFAULT).toBe(1)
    expect(PRODUIT_LISTING_PAGE_SIZE_DEFAULT).toBe(50)
    expect(PRODUIT_LISTING_TRI_DEFAULT).toBe("date")
    expect(PRODUIT_LISTING_SENS_DEFAULT).toBe("desc")
  })

  it("tolerates duplicated params, keeping the first occurrence", () => {
    expect(parseProduitListingParams({ page: ["7", "9"] }).page).toBe(7)
    expect(
      parseProduitListingParams({ structure: ["categorie-1", "categorie-2"] })
        .structure
    ).toBe("categorie-1")
  })

  it("treats whitespace-only q as absent", () => {
    expect(parseProduitListingParams({ q: "   " }).q).toBeUndefined()
  })

  it("accepts an unknown structure identifier without throwing", () => {
    expect(
      parseProduitListingParams({ structure: "structure-disparue" }).structure
    ).toBe("structure-disparue")
  })
})

describe("buildProduitListingUrl", () => {
  it("builds the bare listing path when every value is default", () => {
    expect(buildProduitListingUrl({})).toBe("/admin/produits")
    expect(
      buildProduitListingUrl({
        tri: PRODUIT_LISTING_TRI_DEFAULT,
        sens: PRODUIT_LISTING_SENS_DEFAULT,
        page: PRODUIT_LISTING_PAGE_DEFAULT,
        pageSize: PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
      })
    ).toBe("/admin/produits")
  })

  it("omits default values and emits canonical param order", () => {
    expect(
      buildProduitListingUrl({
        q: "chaise",
        structure: "categorie-1",
        misEnAvant: true,
        livraisonOfferte: true,
        stock: PRODUIT_STOCK_ZERO,
        page: 3,
        pageSize: 20,
        tri: "prix",
        sens: "asc",
      })
    ).toBe(
      "/admin/produits?page=3&pageSize=20&q=chaise&structure=categorie-1&misEnAvant=1&livraisonOfferte=1&stock=zero&tri=prix&sens=asc"
    )
  })

  it("fills partial inputs with defaults exactly as parse does", () => {
    expect(buildProduitListingUrl({ q: "chaise" })).toBe(
      "/admin/produits?q=chaise"
    )
    expect(buildProduitListingUrl({ page: 2 })).toBe("/admin/produits?page=2")
    expect(buildProduitListingUrl({ pageSize: 20 })).toBe(
      "/admin/produits?pageSize=20"
    )
    expect(buildProduitListingUrl({ tri: "stock" })).toBe(
      "/admin/produits?tri=stock"
    )
    expect(buildProduitListingUrl({ sens: "asc" })).toBe(
      "/admin/produits?sens=asc"
    )
    expect(buildProduitListingUrl({ stock: PRODUIT_STOCK_NON_NUL })).toBe(
      "/admin/produits?stock=non-zero"
    )
    expect(buildProduitListingUrl({ structure: PRODUIT_STRUCTURE_SANS })).toBe(
      "/admin/produits?structure=sans_structure"
    )
  })

  it("réserve un jeton qu'aucun slug ni identifiant de Structure ne peut porter", () => {
    expect(PRODUIT_STRUCTURE_SANS).toMatch(/_/)
    expect(PRODUIT_STRUCTURE_SANS).not.toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it("never emits a false flag, and trims q or omits it when blank", () => {
    expect(
      buildProduitListingUrl({ misEnAvant: false, livraisonOfferte: false })
    ).toBe("/admin/produits")
    expect(buildProduitListingUrl({ q: " chaise " })).toBe(
      "/admin/produits?q=chaise"
    )
    expect(buildProduitListingUrl({ q: "   " })).toBe("/admin/produits")
  })
})

describe("round trip", () => {
  const fullViews: ProduitListingParams[] = [
    { tri: "date", sens: "desc", page: 1, pageSize: 50 },
    {
      q: "chaise",
      structure: "categorie-1",
      misEnAvant: true,
      livraisonOfferte: true,
      stock: PRODUIT_STOCK_ZERO,
      tri: "prix",
      sens: "asc",
      page: 3,
      pageSize: 20,
    },
    {
      structure: PRODUIT_STRUCTURE_SANS,
      stock: PRODUIT_STOCK_NON_NUL,
      tri: "stock",
      sens: "asc",
      page: 1,
      pageSize: 10,
    },
    {
      q: "anne",
      tri: "nom",
      sens: "asc",
      page: 2,
      pageSize: 50,
    },
  ]

  const partialViews: ProduitListingParams[] = [
    {},
    { q: "chaise" },
    { page: 2 },
    { pageSize: 20 },
    { tri: "stock" },
    { sens: "asc" },
    { misEnAvant: true },
    { livraisonOfferte: true },
    { stock: PRODUIT_STOCK_ZERO },
    { structure: "categorie-1" },
    {
      structure: PRODUIT_STRUCTURE_SANS,
      q: "chaise",
      tri: "nom",
      sens: "desc",
      page: 4,
      pageSize: 10,
    },
  ]

  const defaults: ProduitListingParams = {
    tri: PRODUIT_LISTING_TRI_DEFAULT,
    sens: PRODUIT_LISTING_SENS_DEFAULT,
    page: PRODUIT_LISTING_PAGE_DEFAULT,
    pageSize: PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
  }

  it("keeps full views identical through build then parse", () => {
    for (const view of fullViews) {
      expect(
        parseProduitListingParams(rawFromUrl(buildProduitListingUrl(view)))
      ).toEqual(view)
    }
  })

  it("fills partial views into their full form through build then parse", () => {
    for (const partial of partialViews) {
      expect(
        parseProduitListingParams(rawFromUrl(buildProduitListingUrl(partial)))
      ).toEqual({ ...defaults, ...partial })
    }
  })

  it("keeps canonical URLs as fixed points of build then parse", () => {
    for (const view of fullViews) {
      const url = buildProduitListingUrl(view)
      expect(
        buildProduitListingUrl(parseProduitListingParams(rawFromUrl(url)))
      ).toBe(url)
    }
  })
})
