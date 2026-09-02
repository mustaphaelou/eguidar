// @vitest-environment happy-dom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  parseCommandeListingParams,
  type CommandeListingParams,
} from "@/lib/commande-listing"

import { useCommandeListing } from "./use-commande-listing"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Machine = ReturnType<typeof useCommandeListing>

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
  for (const mounted of roots) mounted.unmount()
  roots.length = 0
  container.remove()
  vi.useRealTimers()
})

function Harness({
  params,
  pageCount,
}: {
  params: CommandeListingParams
  pageCount: number
}) {
  const machine = useCommandeListing({
    params,
    pageCount,
    navigation: { replace },
  })
  React.useEffect(() => {
    latest = machine
  })
  return null
}

function render(params: CommandeListingParams, pageCount = 5): ReactElement {
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

describe("useCommandeListing", () => {
  it("initializes the view and draft from the URL params without pushing", () => {
    render({
      q: "alix",
      page: 3,
      pageSize: 20,
      statuses: ["pending"],
      tri: "total",
      sens: "asc",
    })
    expect(latest!.view).toEqual({
      pageIndex: 2,
      pageSize: 20,
      q: "alix",
      statuses: ["pending"],
      tri: "total",
      sens: "asc",
    })
    expect(latest!.queryDraft).toBe("alix")
    expect(pushedHrefs).toEqual([])
  })

  it("coalesces rapid keystrokes into one href after the debounce, draft visible immediately", () => {
    render({})
    act(() => latest!.onQueryChange("a"))
    expect(latest!.queryDraft).toBe("a")
    expect(pushedHrefs).toEqual([])
    act(() => latest!.onQueryChange("al"))
    act(() => latest!.onQueryChange("ali"))
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(pushedHrefs).toEqual([])
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual(["/admin/commandes?q=ali"])
    expect(latest!.view.q).toBe("ali")
    expect(latest!.queryDraft).toBe("ali")
  })

  it("commits an empty search immediately, back to the first page", () => {
    render({ q: "alix", page: 2 })
    act(() => latest!.onQueryChange("  "))
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual(["/admin/commandes"])
    expect(latest!.view.q).toBe("")
    expect(latest!.queryDraft).toBe("")
  })

  it("keeps uncommitted search text when updating during the debounce window", () => {
    render({})
    act(() => latest!.onQueryChange("alix"))
    act(() => latest!.update({ pageIndex: 2 }))
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual(["/admin/commandes?page=3&q=alix"])
    expect(latest!.view.q).toBe("alix")
    expect(latest!.view.pageIndex).toBe(2)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toHaveLength(1)
  })

  it("treats a URL change matching the last pushed signature as an echo", () => {
    render({ q: "alix" })
    act(() => latest!.update({ pageIndex: 2 }))
    expect(pushedHrefs).toHaveLength(1)
    const pushedHref = pushedHrefs[0]!
    render(parseCommandeListingParams(rawFromUrl(pushedHref)))
    expect(pushedHrefs).toHaveLength(1)
    expect(latest!.view.pageIndex).toBe(2)
  })

  it("adopts an external URL change with its draft and cancels the pending search", () => {
    render({})
    act(() => latest!.onQueryChange("alix"))
    render({ q: "anne", page: 2, tri: "total", sens: "asc" })
    expect(latest!.view).toEqual({
      pageIndex: 1,
      pageSize: 10,
      q: "anne",
      statuses: [],
      tri: "total",
      sens: "asc",
    })
    expect(latest!.queryDraft).toBe("anne")
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toEqual([])
  })

  it("clamps an out-of-range page and pushes the corrected href", () => {
    render({ q: "alix" })
    expect(pushedHrefs).toEqual([])
    render({ page: 99, q: "alix" })
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual(["/admin/commandes?page=5&q=alix"])
    expect(latest!.view.pageIndex).toBe(4)
    expect(latest!.queryDraft).toBe("alix")
  })

  it("resets to the first page when the page size changes through update", () => {
    render({ page: 3 })
    act(() => latest!.update({ pageSize: 50, pageIndex: 0 }))
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual(["/admin/commandes?pageSize=50"])
    expect(latest!.view.pageSize).toBe(50)
    expect(latest!.view.pageIndex).toBe(0)
  })

  it("keeps the requested page when the page size is unchanged", () => {
    render({ page: 3 })
    act(() => latest!.update({ pageIndex: 3 }))
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual(["/admin/commandes?page=4"])
  })

  it("commits a sorting change back to the first page, preserving the query", () => {
    render({ page: 3, q: "alix", pageSize: 20 })
    act(() => latest!.update({ tri: "total", sens: "asc", pageIndex: 0 }))
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual([
      "/admin/commandes?pageSize=20&q=alix&tri=total&sens=asc",
    ])
  })

  it("commits a filter change back to the first page, preserving the query", () => {
    render({ page: 3, q: "alix", pageSize: 20 })
    act(() => latest!.update({ statuses: ["returned"], pageIndex: 0 }))
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual([
      "/admin/commandes?pageSize=20&statut=returned&q=alix",
    ])
  })

  it("blanks search, filters and sort back to the date/desc default on reset", () => {
    render({
      q: "alix",
      statuses: ["pending"],
      tri: "total",
      sens: "asc",
      page: 2,
      pageSize: 20,
    })
    act(() => latest!.reset())
    expect(pushedHrefs).toHaveLength(1)
    expect(pushedHrefs).toEqual(["/admin/commandes?pageSize=20"])
    expect(latest!.view).toEqual({
      pageIndex: 0,
      pageSize: 20,
      q: "",
      statuses: [],
      tri: "date",
      sens: "desc",
    })
    expect(latest!.queryDraft).toBe("")
  })

  it("clears a pending search timer on unmount", () => {
    render({})
    act(() => latest!.onQueryChange("alix"))
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
