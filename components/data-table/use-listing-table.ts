"use client"

import * as React from "react"
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table"

import {
  PAGE_SIZES,
  type AdminListing,
  type ListingParamsOf,
  type PageSize,
  type ResolvedFilter,
  type SortDirection,
} from "@/lib/admin-listing"

const SEARCH_DEBOUNCE_MS = 300

type ListingView = {
  pageIndex: number
  pageSize: PageSize
  q: string
  tri: string
  sens: SortDirection
  filterValues: Record<string, unknown>
}

type ListingSchema = {
  readonly sortColumns: readonly string[]
  readonly defaults: Readonly<{
    page: number
    pageSize: PageSize
    tri: string
    sens: SortDirection
  }>
  readonly filters: readonly ResolvedFilter[]
  buildUrl(view: Record<string, unknown>): string
}

export type UseListingTableArgs<L extends AdminListing> = {
  listing: L
  params: ListingParamsOf<L>
  pageCount: number
  replace: (href: string) => void
}

export type ListingTableOptions = {
  pageCount: number
  state: {
    sorting: SortingState
    pagination: PaginationState
    columnFilters: ColumnFiltersState
    globalFilter: string
  }
  onSortingChange: (updater: Updater<SortingState> | undefined) => void
  onPaginationChange: (updater: Updater<PaginationState>) => void
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void
  onGlobalFilterChange: (updater: Updater<string> | undefined) => void
  manualPagination: true
  manualSorting: true
  manualFiltering: true
}

export type ListingTableMachine = {
  tableOptions: ListingTableOptions
  hasActiveCriteria: boolean
  reset: () => void
}

function toSchema(listing: AdminListing): ListingSchema {
  return listing as unknown as ListingSchema
}

function resolveUpdater<T>(
  updater: Updater<T> | undefined,
  current: T
): T | undefined {
  if (updater === undefined) return undefined
  return typeof updater === "function"
    ? (updater as (old: T) => T)(current)
    : updater
}

function filterFromParam(filter: ResolvedFilter, value: unknown): unknown {
  if (filter.kind === "multi-enum") {
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (token): token is string =>
                typeof token === "string" && filter.values.includes(token)
            )
          ),
        ]
      : []
  }
  if (filter.kind === "single-enum") {
    return typeof value === "string" && filter.values.includes(value)
      ? value
      : undefined
  }
  if (filter.kind === "single-token") {
    return typeof value === "string" ? value.trim() : ""
  }
  return value === true
}

function filterFromColumnFilter(
  filter: ResolvedFilter,
  filters: ColumnFiltersState
): unknown {
  const value = filters.find((entry) => entry.id === filter.columnId)?.value
  if (filter.kind === "multi-enum") {
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (token): token is string =>
                typeof token === "string" && filter.values.includes(token)
            )
          ),
        ]
      : []
  }
  if (filter.kind === "single-enum") {
    if (!Array.isArray(value)) return undefined
    return value.find(
      (token): token is string =>
        typeof token === "string" && filter.values.includes(token)
    )
  }
  if (filter.kind === "single-token") {
    if (!Array.isArray(value)) return ""
    const token = value.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0
    )
    return token?.trim() ?? ""
  }
  return (
    Array.isArray(value) &&
    value.some((entry) => typeof entry === "string" && entry.length > 0)
  )
}

function columnValueOf(filter: ResolvedFilter, value: unknown): unknown {
  if (filter.kind === "multi-enum") {
    return Array.isArray(value)
      ? value.filter((token): token is string => typeof token === "string")
      : []
  }
  if (filter.kind === "single-enum" || filter.kind === "single-token") {
    return typeof value === "string" && value.length > 0 ? [value] : []
  }
  return value === true ? ["1"] : []
}

function isFilterActive(filter: ResolvedFilter, value: unknown): boolean {
  if (filter.kind === "multi-enum") {
    return Array.isArray(value) && value.length > 0
  }
  if (filter.kind === "single-enum" || filter.kind === "single-token") {
    return typeof value === "string" && value.trim().length > 0
  }
  return value === true
}

export function useListingTable<L extends AdminListing>({
  listing,
  params,
  pageCount,
  replace,
}: UseListingTableArgs<L>): ListingTableMachine {
  const schemaRef = React.useRef<ListingSchema>(toSchema(listing))
  const replaceRef = React.useRef(replace)
  React.useEffect(() => {
    schemaRef.current = toSchema(listing)
    replaceRef.current = replace
  })

  const [view, setView] = React.useState<ListingView>(() =>
    viewFromParams(toSchema(listing), params, pageCount)
  )
  const [queryDraft, setQueryDraft] = React.useState<string>(view.q)
  const intentRef = React.useRef<ListingView>(view)
  const queryDraftRef = React.useRef<string>(view.q)
  const lastPushedRef = React.useRef<string>(viewHref(toSchema(listing), view))
  const supersededHrefsRef = React.useRef<Set<string>>(new Set())
  const fromCommitRef = React.useRef(false)
  const searchTimerRef = React.useRef<number | null>(null)
  const clampGuardRef = React.useRef<string | null>(null)

  const cancelPendingSearch = React.useCallback(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
  }, [])

  const commit = React.useCallback(
    (next: ListingView, fromSearch = false) => {
      if (!fromSearch) cancelPendingSearch()
      const href = viewHref(schemaRef.current, next)
      if (fromCommitRef.current && lastPushedRef.current !== href) {
        supersededHrefsRef.current.add(lastPushedRef.current)
      }
      lastPushedRef.current = href
      fromCommitRef.current = true
      intentRef.current = next
      queryDraftRef.current = next.q
      setView(next)
      setQueryDraft(next.q)
      replaceRef.current(href)
    },
    [cancelPendingSearch]
  )

  React.useEffect(() => {
    const schema = schemaRef.current
    const requestedPage = (params as unknown as { page?: number }).page ?? 1
    const requestedPageIndex = requestedPage - 1
    const incoming = viewFromParams(schema, params, pageCount)
    const wasClamped = incoming.pageIndex !== requestedPageIndex
    const href = viewHref(schema, incoming)

    if (wasClamped) {
      const key = `${JSON.stringify(params)}|${pageCount}`
      if (clampGuardRef.current === key) return
      clampGuardRef.current = key
      cancelPendingSearch()
      if (fromCommitRef.current && lastPushedRef.current !== href) {
        supersededHrefsRef.current.add(lastPushedRef.current)
      }
      lastPushedRef.current = href
      fromCommitRef.current = true
      intentRef.current = incoming
      queryDraftRef.current = incoming.q
      setView(incoming)
      setQueryDraft(incoming.q)
      replaceRef.current(href)
      return
    }

    clampGuardRef.current = null
    if (href === lastPushedRef.current) return
    if (supersededHrefsRef.current.has(href)) return
    cancelPendingSearch()
    supersededHrefsRef.current.clear()
    lastPushedRef.current = href
    fromCommitRef.current = false
    intentRef.current = incoming
    queryDraftRef.current = incoming.q
    setView(incoming)
    setQueryDraft(incoming.q)
  }, [cancelPendingSearch, pageCount, params])

  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }
    }
  }, [])

  const onGlobalFilterChange = React.useCallback(
    (updater: Updater<string> | undefined) => {
      const resolved = resolveUpdater(updater, queryDraftRef.current)
      const text = typeof resolved === "string" ? resolved : ""
      queryDraftRef.current = text
      setQueryDraft(text)
      if (!text.trim()) {
        commit({ ...intentRef.current, q: "", pageIndex: 0 })
        return
      }
      intentRef.current = {
        ...intentRef.current,
        q: text.trim(),
        pageIndex: 0,
      }
      cancelPendingSearch()
      searchTimerRef.current = window.setTimeout(() => {
        searchTimerRef.current = null
        commit(intentRef.current, true)
      }, SEARCH_DEBOUNCE_MS)
    },
    [cancelPendingSearch, commit]
  )

  const onSortingChange = React.useCallback(
    (updater: Updater<SortingState> | undefined) => {
      const intent = intentRef.current
      const current: SortingState = [
        { id: intent.tri, desc: intent.sens === "desc" },
      ]
      const sorting = resolveUpdater(updater, current)
      const first = sorting?.[0]
      const tri =
        first !== undefined &&
        (schemaRef.current.sortColumns as readonly string[]).includes(first.id)
          ? first.id
          : schemaRef.current.defaults.tri
      commit({
        ...intent,
        tri,
        sens: first?.desc ? "desc" : "asc",
        pageIndex: 0,
      })
    },
    [commit]
  )

  const onColumnFiltersChange = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const intent = intentRef.current
      const current = columnFiltersOf(schemaRef.current, intent)
      const filters = resolveUpdater(updater, current) ?? []
      const filterValues: Record<string, unknown> = {}
      for (const filter of schemaRef.current.filters) {
        filterValues[filter.key] = filterFromColumnFilter(filter, filters)
      }
      commit({ ...intent, filterValues, pageIndex: 0 })
    },
    [commit]
  )

  const onPaginationChange = React.useCallback(
    (updater: Updater<PaginationState>) => {
      const intent = intentRef.current
      const current: PaginationState = {
        pageIndex: intent.pageIndex,
        pageSize: intent.pageSize,
      }
      const next = resolveUpdater(updater, current)
      if (next === undefined) return
      const pageSize = PAGE_SIZES.find((size) => size === next.pageSize)
      if (pageSize !== undefined && pageSize !== intent.pageSize) {
        commit({ ...intent, pageSize, pageIndex: 0 })
        return
      }
      commit({ ...intent, pageIndex: next.pageIndex })
    },
    [commit]
  )

  const reset = React.useCallback(() => {
    const schema = schemaRef.current
    const filterValues: Record<string, unknown> = {}
    for (const filter of schema.filters) {
      filterValues[filter.key] = filterFromParam(filter, undefined)
    }
    commit({
      ...intentRef.current,
      q: "",
      filterValues,
      tri: schema.defaults.tri,
      sens: schema.defaults.sens,
      pageIndex: 0,
    })
  }, [commit])

  const tableOptions: ListingTableOptions = {
    pageCount,
    state: {
      sorting: [{ id: view.tri, desc: view.sens === "desc" }],
      pagination: { pageIndex: view.pageIndex, pageSize: view.pageSize },
      columnFilters: columnFiltersOf(toSchema(listing), view),
      globalFilter: queryDraft,
    },
    onSortingChange,
    onPaginationChange,
    onColumnFiltersChange,
    onGlobalFilterChange,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  }

  const hasActiveCriteria =
    view.q.trim().length > 0 ||
    listing.filters.some((filter) =>
      isFilterActive(filter, view.filterValues[filter.key])
    )

  return { tableOptions, hasActiveCriteria, reset }
}

function viewFromParams(
  schema: ListingSchema,
  params: object,
  pageCount: number
): ListingView {
  const raw = params as unknown as Record<string, unknown>
  const requestedPage =
    typeof raw.page === "number" && raw.page >= 1 ? raw.page : 1
  const pageSize =
    typeof raw.pageSize === "number" &&
    (PAGE_SIZES as readonly number[]).includes(raw.pageSize)
      ? (raw.pageSize as PageSize)
      : schema.defaults.pageSize
  const tri =
    typeof raw.tri === "string" &&
    (schema.sortColumns as readonly string[]).includes(raw.tri)
      ? raw.tri
      : schema.defaults.tri
  const sens =
    raw.sens === "asc" || raw.sens === "desc" ? raw.sens : schema.defaults.sens
  const filterValues: Record<string, unknown> = {}
  for (const filter of schema.filters) {
    filterValues[filter.key] = filterFromParam(filter, raw[filter.key])
  }
  return {
    pageIndex: Math.min(requestedPage - 1, Math.max(0, pageCount - 1)),
    pageSize,
    q: typeof raw.q === "string" ? raw.q : "",
    tri,
    sens,
    filterValues,
  }
}

function paramsOf(view: ListingView): Record<string, unknown> {
  return {
    page: view.pageIndex + 1,
    pageSize: view.pageSize,
    q: view.q,
    tri: view.tri,
    sens: view.sens,
    ...view.filterValues,
  }
}

function viewHref(schema: ListingSchema, view: ListingView): string {
  return schema.buildUrl(paramsOf(view))
}

function columnFiltersOf(
  schema: ListingSchema,
  view: ListingView
): ColumnFiltersState {
  return schema.filters.flatMap((filter) => {
    const value = columnValueOf(filter, view.filterValues[filter.key])
    const values = Array.isArray(value) ? value : []
    return values.length > 0 ? [{ id: filter.columnId, value: values }] : []
  })
}
