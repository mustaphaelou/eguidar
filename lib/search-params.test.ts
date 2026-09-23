import { describe, expect, it } from "vitest"

import {
  buildSearchHref,
  parsePage,
  parseSearchParams,
  parseSort,
  toggleBrand,
} from "@/lib/search-params"

describe("parseSearchParams", () => {
  it("extracts and trims the query", () => {
    expect(parseSearchParams({ q: "  casque  " }).query).toBe("casque")
  })

  it("takes the first value when a param is repeated", () => {
    expect(parseSearchParams({ q: ["casque", "clavier"] }).query).toBe("casque")
  })

  it("parses a legacy single marque into a one-element brand list", () => {
    expect(
      parseSearchParams({
        q: "sony",
        marque: "Sony",
        categorie: "audio-hifi",
        prix: "2500-5000",
      })
    ).toEqual({
      query: "sony",
      filters: {
        brand: ["Sony"],
        categorySlug: "audio-hifi",
        priceBucketId: "2500-5000",
      },
      sort: "pertinence",
      page: 1,
    })
  })

  it("collects every repeated marque value without duplicates", () => {
    expect(
      parseSearchParams({ marque: ["Sony", "LG", "Sony"] }).filters
    ).toEqual({ brand: ["Sony", "LG"] })
  })

  it("trims and drops empty marque values", () => {
    expect(
      parseSearchParams({ marque: [" Sony ", "", "   ", "LG"] }).filters
    ).toEqual({ brand: ["Sony", "LG"] })
  })

  it("rejects unknown price buckets and keeps valid filters", () => {
    expect(
      parseSearchParams({ q: "sony", marque: "Sony", prix: "bogus" })
    ).toEqual({
      query: "sony",
      filters: { brand: ["Sony"] },
      sort: "pertinence",
      page: 1,
    })
  })

  it("returns an empty query and empty filters for empty params", () => {
    expect(parseSearchParams({})).toEqual({
      query: "",
      filters: {},
      sort: "pertinence",
      page: 1,
    })
  })

  it("parses sort and page params", () => {
    expect(parseSearchParams({ tri: "prix-asc", page: "3" }).sort).toBe(
      "prix-asc"
    )
    expect(parseSearchParams({ tri: "prix-asc", page: "3" }).page).toBe(3)
  })

  it("falls back to defaults for unknown sort and invalid page", () => {
    expect(parseSearchParams({ tri: "bogus", page: "-2" }).sort).toBe(
      "pertinence"
    )
    expect(parseSearchParams({ tri: "bogus", page: "-2" }).page).toBe(1)
    expect(parseSearchParams({ page: "2.5" }).page).toBe(1)
  })

  it("uses the provided default sort when tri is absent", () => {
    expect(parseSearchParams({}, "nouveautes").sort).toBe("nouveautes")
    expect(parseSearchParams({ tri: "prix-asc" }, "nouveautes").sort).toBe(
      "prix-asc"
    )
  })
})

describe("parseSort and parsePage", () => {
  it("accepts known sort values", () => {
    expect(parseSort("prix-asc")).toBe("prix-asc")
    expect(parseSort("prix-desc")).toBe("prix-desc")
    expect(parseSort("nouveautes")).toBe("nouveautes")
  })

  it("defaults unknown or empty sort to pertinence", () => {
    expect(parseSort("inconnu")).toBe("pertinence")
    expect(parseSort(undefined)).toBe("pertinence")
  })

  it("parses positive integer pages and defaults otherwise", () => {
    expect(parsePage("1")).toBe(1)
    expect(parsePage("24")).toBe(24)
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage("0")).toBe(1)
    expect(parsePage("abc")).toBe(1)
  })
})

describe("buildSearchHref", () => {
  it("links back to the plain search when no filters are active", () => {
    expect(buildSearchHref("casque", {})).toBe("/recherche?q=casque")
  })

  it("preserves the query and existing filters when adding one", () => {
    expect(
      buildSearchHref(
        "casque",
        { brand: ["Sony", "LG"] },
        { categorySlug: "audio-hifi" }
      )
    ).toBe("/recherche?q=casque&marque=Sony&marque=LG&categorie=audio-hifi")
  })

  it("serializes every selected brand as a repeated marque param", () => {
    expect(buildSearchHref("", { brand: ["Sony", "LG", "Logitech"] })).toBe(
      "/recherche?marque=Sony&marque=LG&marque=Logitech"
    )
  })

  it("removes a filter when toggled off", () => {
    expect(
      buildSearchHref(
        "casque",
        { brand: ["Sony", "LG"], categorySlug: "audio-hifi" },
        { brand: ["LG"] }
      )
    ).toBe("/recherche?q=casque&marque=LG&categorie=audio-hifi")
    expect(
      buildSearchHref("casque", { brand: ["Sony"] }, { brand: undefined })
    ).toBe("/recherche?q=casque")
  })

  it("omits the query param when the query is empty", () => {
    expect(buildSearchHref("", { brand: ["Sony"] })).toBe(
      "/recherche?marque=Sony"
    )
  })

  it("omits default sort and first page from the href", () => {
    expect(
      buildSearchHref("casque", {}, {}, { sort: "pertinence", page: 1 })
    ).toBe("/recherche?q=casque")
  })

  it("adds sort and page params when non-default", () => {
    expect(
      buildSearchHref("casque", {}, {}, { sort: "prix-asc", page: 2 })
    ).toBe("/recherche?q=casque&tri=prix-asc&page=2")
    expect(
      buildSearchHref("casque", {}, {}, { sort: "nouveautes", page: 1 })
    ).toBe("/recherche?q=casque&tri=nouveautes")
  })

  it("supports a custom path (catalogue)", () => {
    expect(
      buildSearchHref(
        "",
        { brand: ["Sony", "LG"] },
        {},
        { sort: "nouveautes" },
        "/produits"
      )
    ).toBe("/produits?marque=Sony&marque=LG&tri=nouveautes")
    expect(
      buildSearchHref("", {}, {}, { sort: "nouveautes" }, "/produits")
    ).toBe("/produits?tri=nouveautes")
  })
})

describe("toggleBrand", () => {
  it("adds a brand that is not selected yet", () => {
    expect(toggleBrand(["Sony"], "LG")).toEqual(["Sony", "LG"])
    expect(toggleBrand(undefined, "Sony")).toEqual(["Sony"])
  })

  it("removes a brand that is already selected", () => {
    expect(toggleBrand(["Sony", "LG"], "Sony")).toEqual(["LG"])
    expect(toggleBrand(["Sony"], "Sony")).toEqual([])
  })
})
