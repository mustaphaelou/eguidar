"use client"

import * as React from "react"
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table"

import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  buildCommandeListingUrl,
  COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
  COMMANDE_LISTING_SENS_DEFAULT,
  COMMANDE_LISTING_TRI_DEFAULT,
  STATUT_COLUMN_ID,
  TOTAL_COLUMN_ID,
  type CommandeListingParams,
} from "@/lib/commande-listing"
import { estStatut } from "@/lib/statut-de-commande"
import { PAGE_SIZES } from "@/lib/table-config"

const SEARCH_DEBOUNCE_MS = 300

export interface CommandeListingNavigation {
  replace(href: string): void
}

export type CommandeListingView = {
  pageIndex: number
  pageSize: (typeof PAGE_SIZES)[number]
  q: string
  statuses: OrderStatus[]
  tri: "date" | "total"
  sens: "asc" | "desc"
}

type UseCommandeListingArgs = {
  params: CommandeListingParams
  pageCount: number
  navigation: CommandeListingNavigation
}

type CommandeListingMachine = {
  view: CommandeListingView
  queryDraft: string
  onQueryChange: (value: string) => void
  onSortingChange: (updater: Updater<SortingState> | undefined) => void
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void
  onPaginationChange: (updater: Updater<PaginationState>) => void
  reset: () => void
}

function viewFromParams(
  params: CommandeListingParams,
  pageCount: number
): CommandeListingView {
  return {
    pageIndex: Math.min((params.page ?? 1) - 1, Math.max(0, pageCount - 1)),
    pageSize: params.pageSize ?? COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
    q: params.q ?? "",
    statuses: params.statuses ? [...params.statuses] : [],
    tri: params.tri ?? COMMANDE_LISTING_TRI_DEFAULT,
    sens: params.sens ?? COMMANDE_LISTING_SENS_DEFAULT,
  }
}

function signatureOf(view: CommandeListingView): string {
  return JSON.stringify({
    p: view.pageIndex,
    s: view.pageSize,
    q: view.q.trim(),
    f: [...view.statuses],
    t: view.tri,
    d: view.sens,
  })
}

function hrefOf(view: CommandeListingView): string {
  return buildCommandeListingUrl({
    page: view.pageIndex + 1,
    pageSize: view.pageSize,
    q: view.q,
    statuses: view.statuses,
    tri: view.tri,
    sens: view.sens,
  })
}

function reconcile(
  params: CommandeListingParams,
  pageCount: number,
  lastPushedSignature: string
): { echo: boolean; view: CommandeListingView; correctedHref?: string } {
  const view = viewFromParams(params, pageCount)
  if (signatureOf(view) === lastPushedSignature) {
    return { echo: true, view }
  }
  const requestedPageIndex = (params.page ?? 1) - 1
  const correctedHref =
    view.pageIndex !== requestedPageIndex ? hrefOf(view) : undefined
  return { echo: false, view, correctedHref }
}

function resolveUpdater<T>(updater: T | ((old: T) => T), current: T): T {
  return typeof updater === "function"
    ? (updater as (old: T) => T)(current)
    : updater
}

function partialViewFromSorting(
  sorting: SortingState | undefined
): Partial<CommandeListingView> {
  const first = sorting?.[0]
  return {
    tri: first?.id === TOTAL_COLUMN_ID ? "total" : "date",
    sens: first?.desc ? "desc" : "asc",
    pageIndex: 0,
  }
}

function partialViewFromFilters(
  filters: ColumnFiltersState
): Partial<CommandeListingView> {
  const entry = filters.find((filter) => filter.id === STATUT_COLUMN_ID)
  const statuses = Array.isArray(entry?.value)
    ? entry.value.filter(
        (value): value is OrderStatus =>
          typeof value === "string" && estStatut(value)
      )
    : []
  return { statuses, pageIndex: 0 }
}

function partialViewFromPagination(
  next: PaginationState,
  current: CommandeListingView
): Partial<CommandeListingView> {
  const pageSize = PAGE_SIZES.find((size) => size === next.pageSize)
  if (pageSize !== undefined && pageSize !== current.pageSize) {
    return { pageSize, pageIndex: 0 }
  }
  return { pageIndex: next.pageIndex }
}

export function useCommandeListing({
  params,
  pageCount,
  navigation,
}: UseCommandeListingArgs): CommandeListingMachine {
  const [view, setView] = React.useState<CommandeListingView>(() =>
    viewFromParams(params, pageCount)
  )
  const [queryDraft, setQueryDraft] = React.useState<string>(view.q)
  const intentRef = React.useRef<CommandeListingView>(view)
  const lastPushedRef = React.useRef<string>(signatureOf(view))
  const searchTimerRef = React.useRef<number | null>(null)
  const navigationRef = React.useRef(navigation)
  React.useEffect(() => {
    navigationRef.current = navigation
  })

  const cancelPendingSearch = React.useCallback(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
  }, [])

  const commit = React.useCallback(
    (next: CommandeListingView, fromSearch = false) => {
      if (!fromSearch) cancelPendingSearch()
      lastPushedRef.current = signatureOf(next)
      setView(next)
      setQueryDraft(next.q)
      navigationRef.current.replace(hrefOf(next))
    },
    [cancelPendingSearch]
  )

  const commitPartial = React.useCallback(
    (partial: Partial<CommandeListingView>) => {
      commit({ ...intentRef.current, ...partial })
    },
    [commit]
  )

  React.useEffect(() => {
    const {
      echo,
      view: incoming,
      correctedHref,
    } = reconcile(params, pageCount, lastPushedRef.current)
    if (echo) return
    cancelPendingSearch()
    lastPushedRef.current = signatureOf(incoming)
    intentRef.current = incoming
    setView(incoming)
    setQueryDraft(incoming.q)
    if (correctedHref) {
      navigationRef.current.replace(correctedHref)
    }
  }, [cancelPendingSearch, params, pageCount])

  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current)
      }
    }
  }, [])

  const onQueryChange = React.useCallback(
    (value: string) => {
      setQueryDraft(value)
      const q = value.trim()
      if (!q) {
        commit({ ...intentRef.current, q: "", pageIndex: 0 })
        return
      }
      intentRef.current = { ...intentRef.current, q, pageIndex: 0 }
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
      const current: SortingState = [
        { id: view.tri, desc: view.sens === "desc" },
      ]
      const sorting =
        updater === undefined ? undefined : resolveUpdater(updater, current)
      commitPartial(partialViewFromSorting(sorting))
    },
    [commitPartial, view.sens, view.tri]
  )

  const onColumnFiltersChange = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const current: ColumnFiltersState =
        view.statuses.length > 0
          ? [{ id: STATUT_COLUMN_ID, value: [...view.statuses] }]
          : []
      commitPartial(partialViewFromFilters(resolveUpdater(updater, current)))
    },
    [commitPartial, view.statuses]
  )

  const onPaginationChange = React.useCallback(
    (updater: Updater<PaginationState>) => {
      const current: PaginationState = {
        pageIndex: view.pageIndex,
        pageSize: view.pageSize,
      }
      commitPartial(
        partialViewFromPagination(resolveUpdater(updater, current), view)
      )
    },
    [commitPartial, view]
  )

  const reset = React.useCallback(() => {
    commit({
      ...intentRef.current,
      tri: COMMANDE_LISTING_TRI_DEFAULT,
      sens: COMMANDE_LISTING_SENS_DEFAULT,
      q: "",
      statuses: [],
      pageIndex: 0,
    })
  }, [commit])

  return {
    view,
    queryDraft,
    onQueryChange,
    onSortingChange,
    onColumnFiltersChange,
    onPaginationChange,
    reset,
  }
}
