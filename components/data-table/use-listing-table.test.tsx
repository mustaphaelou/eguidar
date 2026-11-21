// @vitest-environment happy-dom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AdminListing, ListingParamsOf } from "@/lib/admin-listing"
import {
  COMMANDE_LISTING,
  parseCommandeListingParams,
  type CommandeListingParams,
} from "@/lib/commande-listing"
import {
  PRODUIT_LISTING,
  PRODUIT_STOCK_NON_NUL,
  PRODUIT_STOCK_ZERO,
  type ProduitListingParams,
} from "@/lib/produit-listing"

import { useListingTable, type ListingTableMachine } from "./use-listing-table"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let root: ReturnType<typeof createRoot> | null = null
let latest: ListingTableMachine | null = null
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

function Harness<L extends AdminListing>({
  listing,
  params,
  pageCount,
}: {
  listing: L
  params: ListingParamsOf<L>
  pageCount: number
}) {
  const machine = useListingTable({ listing, params, pageCount, replace })
  React.useEffect(() => {
    latest = machine
  })
  return null
}

function render(
  listing: AdminListing,
  params: object,
  pageCount = 5,
  strict = false
): ReactElement {
  if (!root) {
    root = createRoot(container)
    roots.push(root)
  }
  const harness = (
    <Harness listing={listing} params={params as never} pageCount={pageCount} />
  )
  act(() => {
    root!.render(
      strict ? <React.StrictMode>{harness}</React.StrictMode> : harness
    )
  })
  return harness
}

function renderCommandes(params: CommandeListingParams, pageCount = 5) {
  return render(COMMANDE_LISTING, params, pageCount)
}

function renderProduits(params: ProduitListingParams, pageCount = 5) {
  return render(PRODUIT_LISTING, params, pageCount)
}

function rawFromUrl(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "https://eguidar.test").searchParams)
}

function echoCommandes(): void {
  const href = pushedHrefs.at(-1)!
  renderCommandes(parseCommandeListingParams(rawFromUrl(href)))
}

describe("useListingTable — séquences de commits", () => {
  it("initialise la vue et le brouillon sans naviguer", () => {
    renderCommandes({
      q: "alix",
      page: 3,
      pageSize: 20,
      statuses: ["pending"],
      tri: "total",
      sens: "asc",
    })
    expect(latest!.tableOptions.state).toEqual({
      sorting: [{ id: "total", desc: false }],
      pagination: { pageIndex: 2, pageSize: 20 },
      columnFilters: [{ id: "statut", value: ["pending"] }],
      globalFilter: "alix",
    })
    expect(pushedHrefs).toEqual([])
  })

  it("conserve un filtre à travers un echo puis une pagination", () => {
    renderCommandes({ page: 3, pageSize: 20 })
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "statut", value: ["pending"] },
      ])
    )
    expect(pushedHrefs).toEqual(["/admin/commandes?pageSize=20&statut=pending"])
    echoCommandes()
    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 1, pageSize: 20 })
    )
    expect(pushedHrefs).toEqual([
      "/admin/commandes?pageSize=20&statut=pending",
      "/admin/commandes?page=2&pageSize=20&statut=pending",
    ])
    expect(latest!.tableOptions.state.columnFilters).toEqual([
      { id: "statut", value: ["pending"] },
    ])
  })

  it("conserve le tri à travers un echo puis une pagination", () => {
    renderCommandes({ page: 3, tri: "date", sens: "desc" })
    act(() =>
      latest!.tableOptions.onSortingChange([{ id: "total", desc: false }])
    )
    expect(pushedHrefs).toEqual(["/admin/commandes?tri=total&sens=asc"])
    echoCommandes()
    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 1, pageSize: 10 })
    )
    expect(pushedHrefs.at(-1)).toBe(
      "/admin/commandes?page=2&tri=total&sens=asc"
    )
    expect(latest!.tableOptions.state.sorting).toEqual([
      { id: "total", desc: false },
    ])
  })

  it("conserve la taille de page à travers un echo puis un filtre", () => {
    renderCommandes({ page: 3 })
    act(() =>
      latest!.tableOptions.onPaginationChange((old) => ({
        ...old,
        pageSize: 50,
      }))
    )
    expect(pushedHrefs).toEqual(["/admin/commandes?pageSize=50"])
    echoCommandes()
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "statut", value: ["returned"] },
      ])
    )
    expect(pushedHrefs.at(-1)).toBe(
      "/admin/commandes?pageSize=50&statut=returned"
    )
    expect(latest!.tableOptions.state.pagination.pageSize).toBe(50)
  })

  it("ne ressuscite pas une recherche effacée après un echo puis une pagination", () => {
    renderCommandes({ q: "alix", page: 2 })
    act(() => latest!.tableOptions.onGlobalFilterChange("   "))
    expect(pushedHrefs).toEqual(["/admin/commandes"])
    echoCommandes()
    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 1, pageSize: 10 })
    )
    expect(pushedHrefs.at(-1)).toBe("/admin/commandes?page=2")
    expect(latest!.tableOptions.state.globalFilter).toBe("")
  })

  it("ignore l'echo périmé d'un commit devancé par une navigation plus récente", () => {
    renderCommandes({})
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "statut", value: ["pending"] },
      ])
    )
    const obsoleteHref = pushedHrefs.at(-1)!
    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 1, pageSize: 10 })
    )
    const dernierHref = pushedHrefs.at(-1)!
    expect(obsoleteHref).not.toBe(dernierHref)
    renderCommandes(parseCommandeListingParams(rawFromUrl(obsoleteHref)))
    expect(pushedHrefs).toEqual([obsoleteHref, dernierHref])
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(1)
    expect(latest!.tableOptions.state.columnFilters).toEqual([
      { id: "statut", value: ["pending"] },
    ])
  })

  it("adopte une navigation externe après avoir ignoré un echo périmé", () => {
    renderCommandes({})
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "statut", value: ["pending"] },
      ])
    )
    const obsoleteHref = pushedHrefs.at(-1)!
    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 1, pageSize: 10 })
    )
    renderCommandes(parseCommandeListingParams(rawFromUrl(obsoleteHref)))
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(1)
    renderCommandes({ q: "externe", page: 2 })
    expect(latest!.tableOptions.state.globalFilter).toBe("externe")
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(1)
    expect(latest!.tableOptions.state.columnFilters).toEqual([])
  })

  it("supprime un echo sans seconde navigation", () => {
    renderCommandes({ q: "alix" })
    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 2, pageSize: 10 })
    )
    const href = pushedHrefs[0]!
    echoCommandes()
    expect(pushedHrefs).toEqual([href])
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(2)
  })

  it("adopte une URL externe et annule la recherche en attente", () => {
    renderCommandes({})
    act(() => latest!.tableOptions.onGlobalFilterChange("alix"))
    renderCommandes({ q: "anne", page: 2, tri: "total", sens: "asc" })
    expect(latest!.tableOptions.state.globalFilter).toBe("anne")
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(1)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toEqual([])
  })
})

describe("useListingTable — amortissement de la recherche", () => {
  it("regroupe les frappes en une navigation après 300 ms", () => {
    renderCommandes({})
    act(() => latest!.tableOptions.onGlobalFilterChange("a"))
    expect(latest!.tableOptions.state.globalFilter).toBe("a")
    expect(pushedHrefs).toEqual([])
    act(() => latest!.tableOptions.onGlobalFilterChange("al"))
    act(() => latest!.tableOptions.onGlobalFilterChange("ali"))
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(pushedHrefs).toEqual([])
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(pushedHrefs).toEqual(["/admin/commandes?q=ali"])
    expect(latest!.tableOptions.state.globalFilter).toBe("ali")
  })

  it("commit immédiatement une recherche vidée et revient en page 1", () => {
    renderCommandes({ q: "alix", page: 2 })
    act(() => latest!.tableOptions.onGlobalFilterChange("  "))
    expect(pushedHrefs).toEqual(["/admin/commandes"])
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(0)
  })

  it("préserve la recherche en cours sur un filtre, un tri ou une pagination", () => {
    renderCommandes({ pageSize: 20 })
    act(() => latest!.tableOptions.onGlobalFilterChange("alix"))
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "statut", value: ["pending"] },
      ])
    )
    expect(pushedHrefs).toEqual([
      "/admin/commandes?pageSize=20&q=alix&statut=pending",
    ])
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toHaveLength(1)

    renderCommandes({ pageSize: 20 })
    act(() => latest!.tableOptions.onGlobalFilterChange("alix"))
    act(() =>
      latest!.tableOptions.onSortingChange([{ id: "total", desc: true }])
    )
    expect(pushedHrefs.at(-1)).toBe(
      "/admin/commandes?pageSize=20&q=alix&tri=total"
    )

    renderCommandes({ pageSize: 20 })
    act(() => latest!.tableOptions.onGlobalFilterChange("alix"))
    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 1, pageSize: 20 })
    )
    expect(pushedHrefs.at(-1)).toBe(
      "/admin/commandes?page=2&pageSize=20&q=alix"
    )
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toHaveLength(3)
  })

  it("annule le minuteur au démontage", () => {
    renderCommandes({})
    act(() => latest!.tableOptions.onGlobalFilterChange("alix"))
    act(() => root!.unmount())
    roots.length = 0
    root = null
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toEqual([])
  })
})

describe("useListingTable — cadrage et navigation", () => {
  it("recadre une page hors limites et corrige la barre d'adresse", () => {
    renderCommandes({})
    renderCommandes({ page: 99, q: "alix" })
    expect(pushedHrefs).toEqual(["/admin/commandes?page=5&q=alix"])
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(4)
  })

  it("recadre page=99 sur une liste d'une page", () => {
    renderCommandes({}, 1)
    renderCommandes({ page: 99 }, 1)
    expect(pushedHrefs).toEqual(["/admin/commandes"])
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(0)
  })

  it("recadre page=99 sur une liste vide", () => {
    renderCommandes({}, 0)
    renderCommandes({ page: 99 }, 0)
    expect(pushedHrefs).toEqual(["/admin/commandes"])
  })

  it("ne double pas la correction sous React StrictMode", () => {
    render(COMMANDE_LISTING, { page: 99 }, 1, true)
    expect(pushedHrefs).toEqual(["/admin/commandes"])
  })

  it("réinitialise la page quand la taille change et ignore une taille invalide", () => {
    renderCommandes({ page: 3 })
    act(() =>
      latest!.tableOptions.onPaginationChange((old) => ({
        ...old,
        pageSize: 20,
      }))
    )
    expect(pushedHrefs.at(-1)).toBe("/admin/commandes?pageSize=20")
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(0)

    act(() =>
      latest!.tableOptions.onPaginationChange({ pageIndex: 2, pageSize: 35 })
    )
    expect(latest!.tableOptions.state.pagination.pageSize).toBe(20)
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(2)
  })

  it("replie un tri vide sur la colonne et le sens par défaut", () => {
    renderCommandes({ page: 3, tri: "total", sens: "desc" })
    act(() => latest!.tableOptions.onSortingChange([]))
    expect(latest!.tableOptions.state.sorting).toEqual([
      { id: "date", desc: false },
    ])
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(0)
  })

  it("gère les replis de tri et les updaters fonctionnels", () => {
    renderCommandes({ page: 3, tri: "total", sens: "desc" })
    act(() => latest!.tableOptions.onSortingChange(undefined))
    expect(latest!.tableOptions.state.sorting).toEqual([
      { id: "date", desc: false },
    ])
    expect(latest!.tableOptions.state.pagination.pageIndex).toBe(0)

    act(() =>
      latest!.tableOptions.onSortingChange([{ id: "inconnu", desc: true }])
    )
    expect(latest!.tableOptions.state.sorting).toEqual([
      { id: "date", desc: true },
    ])

    act(() =>
      latest!.tableOptions.onSortingChange((old) => [
        { id: old[0]!.id, desc: !old[0]!.desc },
      ])
    )
    expect(latest!.tableOptions.state.sorting).toEqual([
      { id: "date", desc: false },
    ])
  })
})

describe("useListingTable — filtres, critères et réinitialisation", () => {
  it("projette les quatre types de filtres du catalogue", () => {
    renderProduits({ page: 3 })
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "structure", value: ["categorie-1"] },
        { id: "misEnAvant", value: ["1"] },
        { id: "livraisonOfferte", value: ["1"] },
        { id: "stock", value: [PRODUIT_STOCK_ZERO] },
      ])
    )
    expect(pushedHrefs.at(-1)).toBe(
      "/admin/produits?structure=categorie-1&misEnAvant=1&livraisonOfferte=1&stock=zero"
    )
    expect(latest!.tableOptions.state.columnFilters).toEqual([
      { id: "structure", value: ["categorie-1"] },
      { id: "misEnAvant", value: ["1"] },
      { id: "livraisonOfferte", value: ["1"] },
      { id: "stock", value: [PRODUIT_STOCK_ZERO] },
    ])
  })

  it("tolère les valeurs non-tableau et les colonnes inconnues", () => {
    renderProduits({ page: 2, structure: "categorie-1" })
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "structure", value: "categorie-2" },
        { id: "inconnue", value: ["x"] },
        { id: "stock", value: [PRODUIT_STOCK_NON_NUL] },
      ])
    )
    expect(pushedHrefs.at(-1)).toBe("/admin/produits?stock=non-zero")
    expect(latest!.tableOptions.state.columnFilters).toEqual([
      { id: "stock", value: [PRODUIT_STOCK_NON_NUL] },
    ])
  })

  it("ne garde que le premier jeton valide pour chaque filtre", () => {
    renderProduits({})
    act(() =>
      latest!.tableOptions.onColumnFiltersChange([
        { id: "structure", value: ["  ", "categorie-1", "categorie-2"] },
        { id: "stock", value: ["bogus", PRODUIT_STOCK_NON_NUL] },
        { id: "misEnAvant", value: [] },
        { id: "livraisonOfferte", value: ["1"] },
      ])
    )
    expect(pushedHrefs.at(-1)).toBe(
      "/admin/produits?structure=categorie-1&livraisonOfferte=1&stock=non-zero"
    )
  })

  it("résout un updater fonctionnel de filtres sur l'intention courante", () => {
    renderCommandes({ page: 2, statuses: ["pending"] })
    act(() =>
      latest!.tableOptions.onColumnFiltersChange((old) =>
        old.map((filtre) => ({ ...filtre, value: ["returned"] }))
      )
    )
    expect(pushedHrefs.at(-1)).toBe("/admin/commandes?statut=returned")
    expect(latest!.tableOptions.state.columnFilters).toEqual([
      { id: "statut", value: ["returned"] },
    ])
  })

  it("ne reflète que les critères commités", () => {
    renderCommandes({})
    expect(latest!.hasActiveCriteria).toBe(false)
    act(() => latest!.tableOptions.onGlobalFilterChange("alix"))
    expect(latest!.hasActiveCriteria).toBe(false)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    echoCommandes()
    expect(latest!.hasActiveCriteria).toBe(true)

    renderCommandes({})
    act(() =>
      latest!.tableOptions.onSortingChange([{ id: "total", desc: true }])
    )
    expect(latest!.hasActiveCriteria).toBe(false)
    act(() => latest!.tableOptions.onGlobalFilterChange("  "))
    echoCommandes()
    expect(latest!.hasActiveCriteria).toBe(false)
  })

  it("réinitialise en une navigation atomique en gardant la taille de page", () => {
    renderProduits({
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
    expect(latest!.tableOptions.state).toEqual({
      sorting: [{ id: "date", desc: true }],
      pagination: { pageIndex: 0, pageSize: 20 },
      columnFilters: [],
      globalFilter: "",
    })
    expect(latest!.hasActiveCriteria).toBe(false)
  })

  it("réinitialise les commandes vers date/desc en gardant la taille de page", () => {
    renderCommandes({
      q: "alix",
      statuses: ["pending"],
      tri: "total",
      sens: "asc",
      page: 2,
      pageSize: 50,
    })
    act(() => latest!.reset())
    expect(pushedHrefs).toEqual(["/admin/commandes?pageSize=50"])
    expect(latest!.tableOptions.state).toEqual({
      sorting: [{ id: "date", desc: true }],
      pagination: { pageIndex: 0, pageSize: 50 },
      columnFilters: [],
      globalFilter: "",
    })
    expect(latest!.hasActiveCriteria).toBe(false)
  })

  it("annule une recherche en attente avant la réinitialisation", () => {
    renderCommandes({ pageSize: 20 })
    act(() => latest!.tableOptions.onGlobalFilterChange("alix"))
    act(() => latest!.reset())
    expect(pushedHrefs).toEqual(["/admin/commandes?pageSize=20"])
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(pushedHrefs).toHaveLength(1)
  })
})
