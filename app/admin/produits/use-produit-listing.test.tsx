// @vitest-environment happy-dom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  parseProduitListingParams,
  PRODUIT_STRUCTURE_SANS,
  PRODUIT_STOCK_ZERO,
  type ProduitListingParams,
} from "@/lib/produit-listing"

import { useProduitListing } from "./use-produit-listing"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Machine = ReturnType<typeof useProduitListing>

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let root: ReturnType<typeof createRoot> | null = null
let latest: Machine | null = null
let pushedHrefs: string[]
let replace: (href: string) => void

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = null
  latest = null
  pushedHrefs = []
  replace = (href: string) => {
    pushedHrefs.push(href)
  }
  vi.useFakeTimers()
})

afterEach(() => {
  for (const mounted of roots) {
    act(() => {
      mounted.unmount()
    })
  }
  roots.length = 0
  container.remove()
  vi.useRealTimers()
})

function Harness({
  params,
  pageCount,
}: {
  params: ProduitListingParams
  pageCount: number
}) {
  const machine = useProduitListing({
    params,
    pageCount,
    navigation: { replace },
  })
  React.useEffect(() => {
    latest = machine
  })
  return null
}

function render(params: ProduitListingParams, pageCount = 5): ReactElement {
  if (!root) {
    root = createRoot(container)
    roots.push(root)
  }
  const element = <Harness params={params} pageCount={pageCount} />
  act(() => {
    root!.render(element)
  })
  return element
}

function rawFromUrl(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "https://eguidar.test").searchParams)
}

describe("useProduitListing", () => {
  it("initializes the view and draft from the URL params without pushing", () => {
    render({
      q: "chaise",
      page: 3,
      pageSize: 20,
      structure: "categorie-1",
      misEnAvant: true,
      livraisonOfferte: true,
      stock: PRODUIT_STOCK_ZERO,
      tri: "prix",
      sens: "asc",
    })
    expect(latest!.view).toEqual({
      pageIndex: 2,
      pageSize: 20,
      q: "chaise",
      structure: "categorie-1",
      misEnAvant: true,
      livraisonOfferte: true,
      stock: PRODUIT_STOCK_ZERO,
      tri: "prix",
      sens: "asc",
    })
    expect(latest!.queryDraft).toBe("chaise")
    expect(pushedHrefs).toEqual([])
  })

  it("coalesces rapid keystrokes into one href after the debounce, draft visible immediately", () => {
    render({})
    act(() => latest!.onQueryChange("c"))
    expect(latest!.queryDraft).toBe("c")
    expect(pushedHrefs).toEqual([])
    act(() => latest!.onQueryChange("ch"))
    act(() => latest!.onQueryChange("cha"))
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(pushedHrefs).toEqual([])
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(pushedHrefs).toEqual(["/admin/produits?q=cha"])
    expect(latest!.view.q).toBe("cha")
    expect(latest!.queryDraft).toBe("cha")
  })

  it("commits an empty search immediately, back to the first page", () => {
    render({ q: "chaise", page: 2 })
    act(() => latest!.onQueryChange("  "))
    expect(pushedHrefs).toEqual(["/admin/produits"])
    expect(latest!.view.q).toBe("")
    expect(latest!.view.pageIndex).toBe(0)
    expect(latest!.queryDraft).toBe("")
  })

  it("keeps uncommitted search text when paginating during the debounce window", () => {
    render({})
    act(() => latest!.onQueryChange("chaise"))
    act(() => latest!.onPaginationChange({ pageIndex: 2, pageSize: 50 }))
    expect(pushedHrefs).toEqual(["/admin/produits?page=3&q=chaise"])
    expect(latest!.view.q).toBe("chaise")
    expect(latest!.view.pageIndex).toBe(2)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toHaveLength(1)
  })

  it("treats a URL change matching the last pushed signature as an echo", () => {
    render({ q: "chaise" })
    act(() => latest!.onPaginationChange({ pageIndex: 2, pageSize: 50 }))
    const pushedHref = pushedHrefs[0]!
    render(parseProduitListingParams(rawFromUrl(pushedHref)))
    expect(pushedHrefs).toHaveLength(1)
    expect(latest!.view.pageIndex).toBe(2)
  })

  it("adopts an external URL change with its draft and cancels the pending search", () => {
    render({})
    act(() => latest!.onQueryChange("chaise"))
    render({
      q: "table",
      page: 2,
      tri: "prix",
      sens: "asc",
      structure: PRODUIT_STRUCTURE_SANS,
    })
    expect(latest!.view).toEqual({
      pageIndex: 1,
      pageSize: 50,
      q: "table",
      structure: PRODUIT_STRUCTURE_SANS,
      misEnAvant: false,
      livraisonOfferte: false,
      stock: null,
      tri: "prix",
      sens: "asc",
    })
    expect(latest!.queryDraft).toBe("table")
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toEqual([])
  })

  it("clamps an out-of-range page and pushes the corrected href", () => {
    render({ q: "chaise" })
    expect(pushedHrefs).toEqual([])
    render({ page: 99, q: "chaise" })
    expect(pushedHrefs).toEqual(["/admin/produits?page=5&q=chaise"])
    expect(latest!.view.pageIndex).toBe(4)
  })

  it("resets to the first page when the page size changes", () => {
    render({ page: 3 })
    act(() => latest!.onPaginationChange((old) => ({ ...old, pageSize: 20 })))
    expect(pushedHrefs).toEqual(["/admin/produits?pageSize=20"])
    expect(latest!.view.pageSize).toBe(20)
    expect(latest!.view.pageIndex).toBe(0)
  })

  it("keeps the requested page when the page size is unchanged", () => {
    render({ page: 3 })
    act(() => latest!.onPaginationChange({ pageIndex: 3, pageSize: 50 }))
    expect(pushedHrefs).toEqual(["/admin/produits?page=4"])
    expect(latest!.view.pageIndex).toBe(3)
  })

  it("commits a sorting change back to the first page, preserving the filters", () => {
    render({ page: 3, q: "chaise", pageSize: 20, structure: "categorie-1" })
    act(() => latest!.onSortingChange([{ id: "prix", desc: false }]))
    expect(pushedHrefs).toEqual([
      "/admin/produits?pageSize=20&q=chaise&structure=categorie-1&tri=prix&sens=asc",
    ])
    expect(latest!.view.tri).toBe("prix")
    expect(latest!.view.sens).toBe("asc")
    expect(latest!.view.pageIndex).toBe(0)
  })

  it("falls back to date on an unknown sort id, keeping the requested direction", () => {
    render({ page: 3, tri: "prix", sens: "desc" })
    act(() => latest!.onSortingChange([{ id: "bogus", desc: false }]))
    expect(latest!.view.tri).toBe("date")
    expect(latest!.view.sens).toBe("asc")
    expect(latest!.view.pageIndex).toBe(0)
  })

  it("maps the structure and flag facets into the view", () => {
    render({ page: 3, q: "chaise" })
    act(() =>
      latest!.onColumnFiltersChange([
        { id: "structure", value: [PRODUIT_STRUCTURE_SANS] },
        { id: "misEnAvant", value: ["1"] },
        { id: "livraisonOfferte", value: ["1"] },
      ])
    )
    expect(pushedHrefs).toEqual([
      "/admin/produits?q=chaise&structure=sans_structure&misEnAvant=1&livraisonOfferte=1",
    ])
    expect(latest!.view.structure).toBe(PRODUIT_STRUCTURE_SANS)
    expect(latest!.view.misEnAvant).toBe(true)
    expect(latest!.view.livraisonOfferte).toBe(true)
    expect(latest!.view.pageIndex).toBe(0)
  })

  it("keeps only one stock facet, since zero and non-zero exclude each other", () => {
    render({ page: 2, stock: PRODUIT_STOCK_ZERO })
    act(() =>
      latest!.onColumnFiltersChange([{ id: "stock", value: ["non-zero"] }])
    )
    expect(latest!.view.stock).toBe("non-zero")
    expect(pushedHrefs).toEqual(["/admin/produits?stock=non-zero"])

    act(() =>
      latest!.onColumnFiltersChange([
        { id: "stock", value: [PRODUIT_STOCK_ZERO, "non-zero"] },
      ])
    )
    expect(latest!.view.stock).toBe(PRODUIT_STOCK_ZERO)
    expect(pushedHrefs.at(-1)).toBe("/admin/produits?stock=zero")
  })

  it("clears a facet when its value is not an array or names another column", () => {
    render({
      page: 2,
      structure: "categorie-1",
      misEnAvant: true,
      stock: PRODUIT_STOCK_ZERO,
    })
    act(() =>
      latest!.onColumnFiltersChange([
        { id: "structure", value: "categorie-1" },
        { id: "q", value: ["oubli"] },
      ])
    )
    expect(latest!.view.structure).toBeNull()
    expect(latest!.view.misEnAvant).toBe(false)
    expect(latest!.view.stock).toBeNull()
    expect(pushedHrefs).toEqual(["/admin/produits"])
  })

  it("blanks search, filters and sort back to the date/desc default on reset", () => {
    render({
      q: "chaise",
      structure: "categorie-1",
      misEnAvant: true,
      livraisonOfferte: true,
      stock: PRODUIT_STOCK_ZERO,
      tri: "prix",
      sens: "asc",
      page: 2,
      pageSize: 20,
    })
    act(() => latest!.reset())
    expect(pushedHrefs).toEqual(["/admin/produits?pageSize=20"])
    expect(latest!.view).toEqual({
      pageIndex: 0,
      pageSize: 20,
      q: "",
      structure: null,
      misEnAvant: false,
      livraisonOfferte: false,
      stock: null,
      tri: "date",
      sens: "desc",
    })
    expect(latest!.queryDraft).toBe("")
  })

  it("clears a pending search timer on unmount", () => {
    render({})
    act(() => latest!.onQueryChange("chaise"))
    act(() => {
      root!.unmount()
    })
    roots.length = 0
    root = null
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toEqual([])
  })
})
