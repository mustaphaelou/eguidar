import { describe, expect, it } from "vitest"

import {
  buildSearchHref,
  parsePage,
  parseSearchParams,
  parseSort,
  SEARCH_QUERY_MAX_LENGTH,
} from "@/lib/search-params"

function paramsDepuisHref(href: string): Record<string, string | string[]> {
  const url = new URL(href, "https://exemple.test")
  const params: Record<string, string | string[]> = {}
  for (const cle of new Set(url.searchParams.keys())) {
    const valeurs = url.searchParams.getAll(cle)
    params[cle] = valeurs.length === 1 ? valeurs[0]! : valeurs
  }
  return params
}

describe("parseSearchParams", () => {
  it("extracts and trims the query", () => {
    expect(parseSearchParams({ q: "  casque  " }).query).toBe("casque")
  })

  it("borne la requête à la longueur maximale partagée", () => {
    const terme = "a".repeat(10_000)

    const { query } = parseSearchParams({ q: terme })

    expect(query).toBe(terme.slice(0, SEARCH_QUERY_MAX_LENGTH))
    expect(query).toHaveLength(SEARCH_QUERY_MAX_LENGTH)
  })

  it("borne après avoir rogné les espaces du terme", () => {
    const terme = `  ${"a".repeat(SEARCH_QUERY_MAX_LENGTH)}b  `

    expect(parseSearchParams({ q: terme }).query).toBe(
      "a".repeat(SEARCH_QUERY_MAX_LENGTH)
    )
  })

  it("takes the first value when a param is repeated", () => {
    expect(parseSearchParams({ q: ["casque", "clavier"] }).query).toBe("casque")
  })

  it("returns an empty query and the default view for empty params", () => {
    const { query, sort, page } = parseSearchParams({})

    expect(query).toBe("")
    expect(sort).toBe("pertinence")
    expect(page).toBe(1)
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
  it("écrit puis relit la requête, les filtres, le tri et la page", () => {
    const href = buildSearchHref(
      "casque",
      { brand: ["Sony"] },
      {
        brand: ["Sony", "LG"],
        categorySlug: "audio-hifi",
        priceBucketId: "2500-5000",
      },
      { sort: "prix-asc", page: 2 }
    )

    expect(href).toBe(
      "/recherche?q=casque&marque=Sony&marque=LG&categorie=audio-hifi&prix=2500-5000&tri=prix-asc&page=2"
    )
    expect(parseSearchParams(paramsDepuisHref(href))).toEqual({
      query: "casque",
      filters: {
        brand: ["Sony", "LG"],
        categorySlug: "audio-hifi",
        priceBucketId: "2500-5000",
      },
      sort: "prix-asc",
      page: 2,
    })
  })
})
