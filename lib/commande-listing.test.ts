import { describe, expect, it } from "vitest"

import {
  buildCommandeListingUrl,
  COMMANDE_LISTING_PAGE_DEFAULT,
  COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
  COMMANDE_LISTING_SENS_DEFAULT,
  COMMANDE_LISTING_TRI_DEFAULT,
  hrefOf,
  parseCommandeListingParams,
  partialViewFromFilters,
  partialViewFromPagination,
  partialViewFromSorting,
  reconcile,
  resolveUpdater,
  signatureOf,
  type CommandeListingParams,
  type CommandeListingView,
  viewFromParams,
} from "@/lib/commande-listing"

function rawFromUrl(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "https://eguidar.test").searchParams)
}

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
      expect(parseCommandeListingParams({ page: badPage }).page).toBe(
        COMMANDE_LISTING_PAGE_DEFAULT
      )
    }
    expect(parseCommandeListingParams({ pageSize: "35" }).pageSize).toBe(
      COMMANDE_LISTING_PAGE_SIZE_DEFAULT
    )
    expect(parseCommandeListingParams({ pageSize: "abc" }).pageSize).toBe(
      COMMANDE_LISTING_PAGE_SIZE_DEFAULT
    )
    expect(parseCommandeListingParams({ pageSize: "20" }).pageSize).toBe(20)
    expect(parseCommandeListingParams({ tri: "weight" }).tri).toBe(
      COMMANDE_LISTING_TRI_DEFAULT
    )
    expect(parseCommandeListingParams({ sens: "upward" }).sens).toBe(
      COMMANDE_LISTING_SENS_DEFAULT
    )
  })

  it("returns pure defaults on empty input", () => {
    expect(parseCommandeListingParams({})).toEqual({
      tri: COMMANDE_LISTING_TRI_DEFAULT,
      sens: COMMANDE_LISTING_SENS_DEFAULT,
      page: COMMANDE_LISTING_PAGE_DEFAULT,
      pageSize: COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
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
        tri: COMMANDE_LISTING_TRI_DEFAULT,
        sens: COMMANDE_LISTING_SENS_DEFAULT,
        page: COMMANDE_LISTING_PAGE_DEFAULT,
        pageSize: COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
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
    tri: COMMANDE_LISTING_TRI_DEFAULT,
    sens: COMMANDE_LISTING_SENS_DEFAULT,
    page: COMMANDE_LISTING_PAGE_DEFAULT,
    pageSize: COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
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

describe("viewFromParams", () => {
  it("projects params onto the full view, filling defaults", () => {
    expect(
      viewFromParams(
        {
          statuses: ["pending", "returned"],
          q: "alix",
          tri: "total",
          sens: "asc",
          page: 3,
          pageSize: 20,
        },
        10
      )
    ).toEqual<CommandeListingView>({
      pageIndex: 2,
      pageSize: 20,
      q: "alix",
      statuses: ["pending", "returned"],
      tri: "total",
      sens: "asc",
    })
    expect(viewFromParams({}, 10)).toEqual<CommandeListingView>({
      pageIndex: 0,
      pageSize: COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
      q: "",
      statuses: [],
      tri: COMMANDE_LISTING_TRI_DEFAULT,
      sens: COMMANDE_LISTING_SENS_DEFAULT,
    })
  })

  it("clamps pageIndex into [0, pageCount - 1] for out-of-range pages", () => {
    expect(viewFromParams({ page: 99 }, 5).pageIndex).toBe(4)
    expect(viewFromParams({ page: 1 }, 5).pageIndex).toBe(0)
    expect(
      viewFromParams({ page: COMMANDE_LISTING_PAGE_DEFAULT }, 5).pageIndex
    ).toBe(0)
    expect(viewFromParams({ page: 7 }, 1).pageIndex).toBe(0)
    expect(viewFromParams({ page: 7 }, 0).pageIndex).toBe(0)
    expect(viewFromParams({}, 0).pageIndex).toBe(0)
  })

  it("copies statuses so the view is isolated from the params", () => {
    const statuses: CommandeListingParams["statuses"] = ["pending"]
    const view = viewFromParams({ statuses }, 5)
    view.statuses.push("returned")
    expect(statuses).toEqual(["pending"])
  })

  it("keeps views identical through view, href then parse", () => {
    const pageCount = 50
    for (const full of [
      { tri: "date", sens: "desc", page: 1, pageSize: 10 },
      {
        statuses: ["pending", "returned"],
        q: "alix",
        tri: "total",
        sens: "asc",
        page: 3,
        pageSize: 20,
      },
      { q: "anne", tri: "date", sens: "asc", page: 2, pageSize: 10 },
    ] as CommandeListingParams[]) {
      const params = parseCommandeListingParams(
        rawFromUrl(buildCommandeListingUrl(full))
      )
      const view = viewFromParams(params, pageCount)
      const reparsed = parseCommandeListingParams(rawFromUrl(hrefOf(view)))
      expect(viewFromParams(reparsed, pageCount)).toEqual(view)
    }
  })
})

describe("signatureOf", () => {
  const base: CommandeListingView = {
    pageIndex: 2,
    pageSize: 20,
    q: "alix",
    statuses: ["pending"],
    tri: "total",
    sens: "asc",
  }

  it("compares the trimmed q", () => {
    expect(signatureOf({ ...base, q: " alix " })).toBe(signatureOf(base))
    expect(signatureOf({ ...base, q: "alix " })).toBe(signatureOf(base))
    expect(signatureOf({ ...base, q: "alixx" })).not.toBe(signatureOf(base))
  })

  it("distinguishes every field", () => {
    const variants: CommandeListingView[] = [
      { ...base, pageIndex: 3 },
      { ...base, pageSize: 50 },
      { ...base, statuses: ["returned"] },
      { ...base, statuses: ["pending", "returned"] },
      { ...base, tri: "date" },
      { ...base, sens: "desc" },
    ]
    for (const variant of variants) {
      expect(signatureOf(variant)).not.toBe(signatureOf(base))
    }
  })
})

describe("hrefOf", () => {
  it("maps the 0-based pageIndex onto the 1-based page param", () => {
    const view: CommandeListingView = {
      pageIndex: 2,
      pageSize: 20,
      q: "alix",
      statuses: ["pending"],
      tri: "total",
      sens: "asc",
    }
    expect(hrefOf(view)).toBe(
      buildCommandeListingUrl({
        page: 3,
        pageSize: 20,
        q: "alix",
        statuses: ["pending"],
        tri: "total",
        sens: "asc",
      })
    )
    expect(hrefOf(view)).toBe(
      "/admin/commandes?page=3&pageSize=20&statut=pending&q=alix&tri=total&sens=asc"
    )
  })
})

describe("reconcile", () => {
  const pageCount = 5

  it("reports an echo and corrects nothing when the signature matches", () => {
    const params = parseCommandeListingParams({ page: "3", q: "alix" })
    const view = viewFromParams(params, pageCount)
    const result = reconcile(params, pageCount, signatureOf(view))
    expect(result.echo).toBe(true)
    expect(result.correctedHref).toBeUndefined()
    expect(result.view).toEqual(view)
  })

  it("returns the incoming view without a corrected href for an in-range page", () => {
    const params = parseCommandeListingParams({ page: "2", q: "alix" })
    const lastPushed = signatureOf(
      viewFromParams(parseCommandeListingParams({ q: "alix" }), pageCount)
    )
    const result = reconcile(params, pageCount, lastPushed)
    expect(result.echo).toBe(false)
    expect(result.view).toEqual(viewFromParams(params, pageCount))
    expect(result.correctedHref).toBeUndefined()
  })

  it("returns a corrected href when the requested page was clamped", () => {
    const params = parseCommandeListingParams({ page: "99", q: "alix" })
    const result = reconcile(
      params,
      pageCount,
      signatureOf(viewFromParams({}, pageCount))
    )
    expect(result.echo).toBe(false)
    expect(result.view.pageIndex).toBe(pageCount - 1)
    expect(result.correctedHref).toBe(hrefOf(result.view))
    expect(result.correctedHref).toBe("/admin/commandes?page=5&q=alix")
  })

  it("returns a corrected href when a page is requested with no pages at all", () => {
    const params = parseCommandeListingParams({ page: "3", q: "alix" })
    const result = reconcile(
      params,
      0,
      signatureOf(viewFromParams({}, pageCount))
    )
    expect(result.echo).toBe(false)
    expect(result.view.pageIndex).toBe(0)
    expect(result.correctedHref).toBe(hrefOf(result.view))
  })
})

describe("resolveUpdater", () => {
  it("returns a value updater as-is", () => {
    expect(resolveUpdater(3, 7)).toBe(3)
  })

  it("applies a function updater to the current value", () => {
    expect(resolveUpdater((old: number) => old + 1, 7)).toBe(8)
  })
})

describe("partialViewFromSorting", () => {
  it("maps the sorted column id onto tri and the direction onto sens", () => {
    expect(partialViewFromSorting([{ id: "total", desc: true }])).toEqual({
      tri: "total",
      sens: "desc",
      pageIndex: 0,
    })
    expect(partialViewFromSorting([{ id: "date", desc: false }])).toEqual({
      tri: "date",
      sens: "asc",
      pageIndex: 0,
    })
  })

  it("falls back to date/asc on empty sorting and keeps the direction on an unknown id", () => {
    expect(partialViewFromSorting([])).toEqual({
      tri: "date",
      sens: "asc",
      pageIndex: 0,
    })
    expect(partialViewFromSorting([{ id: "bogus", desc: true }])).toEqual({
      tri: "date",
      sens: "desc",
      pageIndex: 0,
    })
  })
})

describe("partialViewFromFilters", () => {
  it("decodes valid statut values from the statut column filter", () => {
    expect(
      partialViewFromFilters([{ id: "statut", value: ["pending", "returned"] }])
    ).toEqual({ statuses: ["pending", "returned"], pageIndex: 0 })
  })

  it("drops invalid statut tokens", () => {
    expect(
      partialViewFromFilters([{ id: "statut", value: ["bogus", "pending"] }])
    ).toEqual({ statuses: ["pending"], pageIndex: 0 })
  })

  it("returns no statuses without a statut entry or a non-array value", () => {
    expect(partialViewFromFilters([])).toEqual({
      statuses: [],
      pageIndex: 0,
    })
    expect(
      partialViewFromFilters([{ id: "client", value: ["pending"] }])
    ).toEqual({ statuses: [], pageIndex: 0 })
    expect(
      partialViewFromFilters([{ id: "statut", value: "pending" }])
    ).toEqual({ statuses: [], pageIndex: 0 })
  })
})

describe("partialViewFromPagination", () => {
  const current: CommandeListingView = {
    pageIndex: 2,
    pageSize: 10,
    q: "alix",
    statuses: [],
    tri: "date",
    sens: "desc",
  }

  it("resets to the first page when the page size changes", () => {
    expect(
      partialViewFromPagination({ pageIndex: 4, pageSize: 50 }, current)
    ).toEqual({ pageSize: 50, pageIndex: 0 })
  })

  it("keeps the requested page when the page size is unchanged", () => {
    expect(
      partialViewFromPagination({ pageIndex: 3, pageSize: 10 }, current)
    ).toEqual({ pageIndex: 3 })
  })
})
