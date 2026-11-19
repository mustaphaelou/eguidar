import { describe, expect, it } from "vitest"

import {
  defineAdminListing,
  PAGE_SIZES,
  type AdminListingDescriptor,
  type AdminListingFilter,
  type RawSearchParams,
} from "@/lib/admin-listing"

const FILTERS = [
  {
    key: "statuses",
    kind: "multi-enum",
    values: ["pending", "returned"],
    param: "statut",
    columnId: "statut",
  },
  {
    key: "triStructure",
    kind: "single-enum",
    values: ["a", "b"],
    param: "structure",
    columnId: "structure",
  },
  {
    key: "client",
    kind: "single-token",
    columnId: "client",
  },
  {
    key: "rapide",
    kind: "boolean-flag",
    param: "rapide",
    columnId: "rapide",
  },
] as const satisfies readonly AdminListingFilter[]

const DESCRIPTOR = {
  path: "/admin/exemple",
  sortColumns: ["date", "total"] as const,
  defaultSort: "date",
  defaultSens: "desc",
  defaultPageSize: 10,
  filters: FILTERS,
} as const satisfies AdminListingDescriptor<
  readonly ["date", "total"],
  typeof FILTERS
>

const LISTING = defineAdminListing(DESCRIPTOR)

function rawFromUrl(url: string): RawSearchParams {
  return Object.fromEntries(new URL(url, "https://eguidar.test").searchParams)
}

function define(desc: Record<string, unknown>): void {
  expect(() =>
    defineAdminListing(
      desc as unknown as AdminListingDescriptor<
        readonly string[],
        readonly AdminListingFilter[]
      >
    )
  ).toThrow()
}

describe("PAGE_SIZES", () => {
  it("owns the closed page-size list", () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50])
  })
})

describe("defineAdminListing — validation", () => {
  it("accepts a complete descriptor and freezes its metadata", () => {
    expect(LISTING.path).toBe("/admin/exemple")
    expect(LISTING.defaults).toEqual({
      tri: "date",
      sens: "desc",
      pageSize: 10,
      page: 1,
    })
    expect(Object.isFrozen(LISTING)).toBe(true)
    expect(Object.isFrozen(LISTING.defaults)).toBe(true)
    expect(Object.isFrozen(LISTING.filters)).toBe(true)
    expect(LISTING.filters.map((filter) => filter.param)).toEqual([
      "statut",
      "structure",
      "client",
      "rapide",
    ])
    expect(LISTING.filters.map((filter) => filter.columnId)).toEqual([
      "statut",
      "structure",
      "client",
      "rapide",
    ])
  })

  it("rejects bad paths", () => {
    for (const path of [
      "admin/exemple",
      "/admin/exemple?",
      "/admin#exemple",
      "",
    ]) {
      define({ ...DESCRIPTOR, path })
    }
  })

  it("rejects empty or duplicate sort columns", () => {
    define({ ...DESCRIPTOR, sortColumns: [] })
    define({ ...DESCRIPTOR, sortColumns: ["date", "date"] })
  })

  it("rejects a default sort absent from the columns", () => {
    define({ ...DESCRIPTOR, defaultSort: "poids" })
  })

  it("rejects a page size outside the closed list", () => {
    define({ ...DESCRIPTOR, defaultPageSize: 35 })
  })

  it("rejects params colliding with core keys or another filter", () => {
    define({
      ...DESCRIPTOR,
      filters: [
        { key: "statuses", kind: "single-token", param: "q", columnId: "a" },
      ],
    })
    define({
      ...DESCRIPTOR,
      filters: [
        { key: "a", kind: "single-token", param: "same", columnId: "a" },
        { key: "b", kind: "single-token", param: "same", columnId: "b" },
      ],
    })
  })

  it("rejects duplicate filter keys and column identifiers", () => {
    define({
      ...DESCRIPTOR,
      filters: [
        { key: "a", kind: "single-token", columnId: "same" },
        { key: "b", kind: "single-token", columnId: "same" },
      ],
    })
    define({
      ...DESCRIPTOR,
      filters: [
        { key: "a", kind: "single-token", columnId: "a" },
        { key: "a", kind: "single-token", columnId: "b" },
      ],
    })
  })

  it("rejects invalid enum declarations", () => {
    define({
      ...DESCRIPTOR,
      filters: [{ key: "a", kind: "multi-enum", values: [], columnId: "a" }],
    })
    define({
      ...DESCRIPTOR,
      filters: [
        { key: "a", kind: "single-enum", values: ["x", "x"], columnId: "a" },
      ],
    })
    define({
      ...DESCRIPTOR,
      filters: [
        {
          key: "a",
          kind: "multi-enum",
          values: ["x,y"],
          columnId: "a",
        },
      ],
    })
  })
})

describe("defineAdminListing — URL grammar", () => {
  it("emits the canonical parameter order", () => {
    expect(
      LISTING.buildUrl({
        page: 3,
        pageSize: 20,
        q: "alix",
        statuses: ["pending", "returned"],
        triStructure: "b",
        client: "alix",
        rapide: true,
        tri: "total",
        sens: "asc",
      })
    ).toBe(
      "/admin/exemple?page=3&pageSize=20&q=alix&statut=pending%2Creturned&structure=b&client=alix&rapide=1&tri=total&sens=asc"
    )
  })

  it("omits every default and returns the bare path", () => {
    expect(LISTING.buildUrl({})).toBe("/admin/exemple")
    expect(
      LISTING.buildUrl({
        page: 1,
        pageSize: 10,
        q: "   ",
        statuses: [],
        rapide: false,
        client: "",
        tri: "date",
        sens: "desc",
      })
    ).toBe("/admin/exemple")
  })

  it("parses all four filter kinds from a flat query", () => {
    expect(
      LISTING.parse({
        page: "2",
        pageSize: "50",
        q: "  alix  ",
        statut: " returned ,pending ,bogus,returned",
        structure: "b",
        client: "  alix  ",
        rapide: "1",
        tri: "total",
        sens: "asc",
      })
    ).toEqual({
      page: 2,
      pageSize: 50,
      q: "alix",
      statuses: ["returned", "pending"],
      triStructure: "b",
      client: "alix",
      rapide: true,
      tri: "total",
      sens: "asc",
    })
  })

  it("falls back per parameter on malformed input without throwing", () => {
    expect(
      LISTING.parse({
        page: "99x",
        pageSize: "35",
        q: "   ",
        statut: "bogus",
        structure: "c",
        client: "   ",
        rapide: "true",
        tri: "poids",
        sens: "upward",
      })
    ).toEqual({
      page: 1,
      pageSize: 10,
      tri: "date",
      sens: "desc",
    })
  })

  it("takes the first occurrence of duplicated parameters", () => {
    expect(
      LISTING.parse({
        page: ["2", "9"],
        statut: ["pending", "returned"],
        structure: ["a", "b"],
        client: ["alix", "anne"],
        rapide: ["1", "0"],
      })
    ).toMatchObject({
      page: 2,
      statuses: ["pending"],
      triStructure: "a",
      client: "alix",
      rapide: true,
    })
  })

  it("keeps canonical URLs as fixed points of build then parse", () => {
    const view = {
      page: 4,
      pageSize: 20 as const,
      q: "alix",
      statuses: ["pending" as const],
      triStructure: "a" as const,
      client: "alix",
      rapide: true,
      tri: "total" as const,
      sens: "asc" as const,
    }
    const url = LISTING.buildUrl(view)
    expect(LISTING.parse(rawFromUrl(url))).toEqual(view)
    expect(LISTING.buildUrl(LISTING.parse(rawFromUrl(url)))).toBe(url)
  })
})
