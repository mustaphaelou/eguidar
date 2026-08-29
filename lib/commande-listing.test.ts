import { describe, expect, it } from "vitest"

import {
  buildCommandeListingUrl,
  parseCommandeListingParams,
  type CommandeListingParams,
} from "@/lib/commande-listing"

describe("parseCommandeListingParams", () => {
  it("maps a fully valid query", () => {
    expect(
      parseCommandeListingParams({
        statut: "pending,confirmed",
        q: " alix ",
        page: "3",
        pageSize: "20",
        tri: "total",
        sens: "asc",
      })
    ).toEqual({
      statuses: ["pending", "confirmed"],
      q: "alix",
      tri: "total",
      sens: "asc",
      page: 3,
      pageSize: 20,
    })
  })

  it("falls back per rule on invalid scalar values", () => {
    for (const badPage of ["-4", "0", "abc", "2.5", ""]) {
      expect(parseCommandeListingParams({ page: badPage }).page).toBe(1)
    }
    expect(parseCommandeListingParams({ pageSize: "35" }).pageSize).toBe(10)
    expect(parseCommandeListingParams({ pageSize: "abc" }).pageSize).toBe(10)
    expect(parseCommandeListingParams({ pageSize: "20" }).pageSize).toBe(20)
    expect(parseCommandeListingParams({ tri: "weight" }).tri).toBe("date")
    expect(parseCommandeListingParams({ sens: "upward" }).sens).toBe("desc")
  })

  it("returns pure defaults on empty input", () => {
    expect(parseCommandeListingParams({})).toEqual({
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 10,
    })
  })

  it("keeps valid statut entries, drops unknown ones and deduplicates", () => {
    expect(
      parseCommandeListingParams({ statut: "bogus,pending , returned,bogus" })
        .statuses
    ).toEqual(["pending", "returned"])
    expect(
      parseCommandeListingParams({ statut: "bogus,weird" }).statuses
    ).toBeUndefined()
    expect(
      parseCommandeListingParams({ statut: "cancelled,cancelled" }).statuses
    ).toEqual(["cancelled"])
    expect(parseCommandeListingParams({ statut: "" }).statuses).toBeUndefined()
  })

  it("tolerates duplicated params, keeping the first occurrence", () => {
    expect(parseCommandeListingParams({ page: ["7", "9"] }).page).toBe(7)
    expect(
      parseCommandeListingParams({ statut: ["pending", "delivered"] }).statuses
    ).toEqual(["pending"])
  })

  it("treats whitespace-only q as absent", () => {
    expect(parseCommandeListingParams({ q: "   " }).q).toBeUndefined()
  })
})

describe("buildCommandeListingUrl", () => {
  it("builds the bare listing path when every value is default", () => {
    expect(buildCommandeListingUrl({})).toBe("/admin/commandes")
    expect(
      buildCommandeListingUrl({
        tri: "date",
        sens: "desc",
        page: 1,
        pageSize: 10,
      })
    ).toBe("/admin/commandes")
  })

  it("omits default values and emits canonical param order", () => {
    expect(
      buildCommandeListingUrl({
        statuses: ["pending", "returned"],
        q: "alix",
        tri: "total",
        sens: "asc",
        page: 3,
        pageSize: 20,
      })
    ).toBe(
      "/admin/commandes?page=3&pageSize=20&statut=pending%2Creturned&q=alix&tri=total&sens=asc"
    )
  })

  it("fills partial inputs with defaults exactly as parse does", () => {
    expect(buildCommandeListingUrl({ statuses: ["pending"] })).toBe(
      "/admin/commandes?statut=pending"
    )
    expect(buildCommandeListingUrl({ q: "alix" })).toBe(
      "/admin/commandes?q=alix"
    )
    expect(buildCommandeListingUrl({ page: 2 })).toBe("/admin/commandes?page=2")
    expect(buildCommandeListingUrl({ pageSize: 50 })).toBe(
      "/admin/commandes?pageSize=50"
    )
    expect(buildCommandeListingUrl({ tri: "total" })).toBe(
      "/admin/commandes?tri=total"
    )
    expect(buildCommandeListingUrl({ sens: "asc" })).toBe(
      "/admin/commandes?sens=asc"
    )
  })

  it("trims q and omits whitespace-only q", () => {
    expect(buildCommandeListingUrl({ q: " alix " })).toBe(
      "/admin/commandes?q=alix"
    )
    expect(buildCommandeListingUrl({ q: "   " })).toBe("/admin/commandes")
  })
})

describe("round trip", () => {
  const fullViews: CommandeListingParams[] = [
    { tri: "date", sens: "desc", page: 1, pageSize: 10 },
    {
      statuses: ["pending", "returned"],
      q: "alix",
      tri: "total",
      sens: "asc",
      page: 3,
      pageSize: 20,
    },
    {
      statuses: ["cancelled"],
      tri: "date",
      sens: "desc",
      page: 1,
      pageSize: 50,
    },
    { q: "anne", tri: "date", sens: "asc", page: 2, pageSize: 10 },
  ]

  const partialViews: CommandeListingParams[] = [
    {},
    { statuses: ["pending"] },
    { q: "alix" },
    { page: 2 },
    { pageSize: 50 },
    { tri: "total" },
    { sens: "asc" },
    {
      statuses: ["returned"],
      q: "sanae",
      tri: "total",
      sens: "asc",
      page: 4,
      pageSize: 20,
    },
  ]

  const defaults: CommandeListingParams = {
    tri: "date",
    sens: "desc",
    page: 1,
    pageSize: 10,
  }

  function rawFromUrl(url: string): Record<string, string> {
    return Object.fromEntries(new URL(url, "https://eguidar.test").searchParams)
  }

  it("keeps full views identical through build then parse", () => {
    for (const view of fullViews) {
      expect(
        parseCommandeListingParams(rawFromUrl(buildCommandeListingUrl(view)))
      ).toEqual(view)
    }
  })

  it("fills partial views into their full form through build then parse", () => {
    for (const partial of partialViews) {
      expect(
        parseCommandeListingParams(rawFromUrl(buildCommandeListingUrl(partial)))
      ).toEqual({ ...defaults, ...partial })
    }
  })

  it("keeps canonical URLs as fixed points of build then parse", () => {
    for (const view of fullViews) {
      const url = buildCommandeListingUrl(view)
      expect(
        buildCommandeListingUrl(parseCommandeListingParams(rawFromUrl(url)))
      ).toBe(url)
    }
  })
})
