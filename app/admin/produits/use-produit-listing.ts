"use client"

import * as React from "react"
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table"

import {
  buildProduitListingUrl,
  DATE_COLUMN_ID,
  estStockProduit,
  LIVRAISON_OFFERTE_COLUMN_ID,
  MISE_EN_AVANT_COLUMN_ID,
  NOM_COLUMN_ID,
  PRIX_COLUMN_ID,
  PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
  PRODUIT_LISTING_SENS_DEFAULT,
  PRODUIT_LISTING_TRI_DEFAULT,
  STOCK_COLUMN_ID,
  STRUCTURE_COLUMN_ID,
  type ProduitListingParams,
  type ProduitStockFiltre,
  type ProduitTri,
} from "@/lib/produit-listing"
import { PAGE_SIZES } from "@/lib/table-config"

const SEARCH_DEBOUNCE_MS = 300

export interface ProduitListingNavigation {
  replace(href: string): void
}

export type ProduitListingView = {
  pageIndex: number
  pageSize: (typeof PAGE_SIZES)[number]
  q: string
  structure: string | null
  misEnAvant: boolean
  livraisonOfferte: boolean
  stock: ProduitStockFiltre | null
  tri: ProduitTri
  sens: "asc" | "desc"
}

type UseProduitListingArgs = {
  params: ProduitListingParams
  pageCount: number
  navigation: ProduitListingNavigation
}

type ProduitListingMachine = {
  view: ProduitListingView
  queryDraft: string
  onQueryChange: (value: string) => void
  onSortingChange: (updater: Updater<SortingState> | undefined) => void
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void
  onPaginationChange: (updater: Updater<PaginationState>) => void
  reset: () => void
}

function viewFromParams(
  params: ProduitListingParams,
  pageCount: number
): ProduitListingView {
  return {
    pageIndex: Math.min((params.page ?? 1) - 1, Math.max(0, pageCount - 1)),
    pageSize: params.pageSize ?? PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
    q: params.q ?? "",
    structure: params.structure ?? null,
    misEnAvant: params.misEnAvant ?? false,
    livraisonOfferte: params.livraisonOfferte ?? false,
    stock: params.stock ?? null,
    tri: params.tri ?? PRODUIT_LISTING_TRI_DEFAULT,
    sens: params.sens ?? PRODUIT_LISTING_SENS_DEFAULT,
  }
}

function signatureOf(view: ProduitListingView): string {
  return JSON.stringify({
    p: view.pageIndex,
    s: view.pageSize,
    q: view.q.trim(),
    st: view.structure,
    ma: view.misEnAvant,
    lo: view.livraisonOfferte,
    k: view.stock,
    t: view.tri,
    d: view.sens,
  })
}

function hrefOf(view: ProduitListingView): string {
  return buildProduitListingUrl({
    page: view.pageIndex + 1,
    pageSize: view.pageSize,
    q: view.q,
    structure: view.structure ?? undefined,
    misEnAvant: view.misEnAvant,
    livraisonOfferte: view.livraisonOfferte,
    stock: view.stock ?? undefined,
    tri: view.tri,
    sens: view.sens,
  })
}

function reconcile(
  params: ProduitListingParams,
  pageCount: number,
  lastPushedSignature: string
): { echo: boolean; view: ProduitListingView; correctedHref?: string } {
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

function triDeLaColonne(id: string | undefined): ProduitTri {
  if (id === NOM_COLUMN_ID) return "nom"
  if (id === PRIX_COLUMN_ID) return "prix"
  if (id === STOCK_COLUMN_ID) return "stock"
  if (id === DATE_COLUMN_ID) return "date"
  return PRODUIT_LISTING_TRI_DEFAULT
}

function partialViewFromSorting(
  sorting: SortingState | undefined
): Partial<ProduitListingView> {
  const first = sorting?.[0]
  return {
    tri: triDeLaColonne(first?.id),
    sens: first?.desc ? "desc" : "asc",
    pageIndex: 0,
  }
}

function premiersTokens(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entree): entree is string => typeof entree === "string")
    : []
}

function partialViewFromFilters(
  filters: ColumnFiltersState
): Partial<ProduitListingView> {
  const valeurDe = (columnId: string): unknown =>
    filters.find((filter) => filter.id === columnId)?.value

  const structure = premiersTokens(valeurDe(STRUCTURE_COLUMN_ID))[0] ?? null
  const stock = premiersTokens(valeurDe(STOCK_COLUMN_ID)).find(estStockProduit)

  return {
    structure,
    misEnAvant: premiersTokens(valeurDe(MISE_EN_AVANT_COLUMN_ID)).length > 0,
    livraisonOfferte:
      premiersTokens(valeurDe(LIVRAISON_OFFERTE_COLUMN_ID)).length > 0,
    stock: stock ?? null,
    pageIndex: 0,
  }
}

function partialViewFromPagination(
  next: PaginationState,
  current: ProduitListingView
): Partial<ProduitListingView> {
  const pageSize = PAGE_SIZES.find((size) => size === next.pageSize)
  if (pageSize !== undefined && pageSize !== current.pageSize) {
    return { pageSize, pageIndex: 0 }
  }
  return { pageIndex: next.pageIndex }
}

export function useProduitListing({
  params,
  pageCount,
  navigation,
}: UseProduitListingArgs): ProduitListingMachine {
  const [view, setView] = React.useState<ProduitListingView>(() =>
    viewFromParams(params, pageCount)
  )
  const [queryDraft, setQueryDraft] = React.useState<string>(view.q)
  const intentRef = React.useRef<ProduitListingView>(view)
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
    (next: ProduitListingView, fromSearch = false) => {
      if (!fromSearch) cancelPendingSearch()
      lastPushedRef.current = signatureOf(next)
      intentRef.current = next
      setView(next)
      setQueryDraft(next.q)
      navigationRef.current.replace(hrefOf(next))
    },
    [cancelPendingSearch]
  )

  const commitPartial = React.useCallback(
    (partial: Partial<ProduitListingView>) => {
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
      const current: ColumnFiltersState = [
        ...(view.structure !== null
          ? [{ id: STRUCTURE_COLUMN_ID, value: [view.structure] }]
          : []),
        ...(view.misEnAvant
          ? [{ id: MISE_EN_AVANT_COLUMN_ID, value: ["1"] }]
          : []),
        ...(view.livraisonOfferte
          ? [{ id: LIVRAISON_OFFERTE_COLUMN_ID, value: ["1"] }]
          : []),
        ...(view.stock !== null
          ? [{ id: STOCK_COLUMN_ID, value: [view.stock] }]
          : []),
      ]
      commitPartial(partialViewFromFilters(resolveUpdater(updater, current)))
    },
    [
      commitPartial,
      view.livraisonOfferte,
      view.misEnAvant,
      view.stock,
      view.structure,
    ]
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
      tri: PRODUIT_LISTING_TRI_DEFAULT,
      sens: PRODUIT_LISTING_SENS_DEFAULT,
      q: "",
      structure: null,
      misEnAvant: false,
      livraisonOfferte: false,
      stock: null,
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
