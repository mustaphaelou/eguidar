"use client"

import * as React from "react"

import {
  COMMANDE_LISTING_SENS_DEFAULT,
  COMMANDE_LISTING_TRI_DEFAULT,
  hrefOf,
  reconcile,
  signatureOf,
  type CommandeListingParams,
  type CommandeListingView,
  viewFromParams,
} from "@/lib/commande-listing"

const SEARCH_DEBOUNCE_MS = 300

export interface CommandeListingNavigation {
  replace(href: string): void
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
  update: (partial: Partial<CommandeListingView>) => void
  reset: () => void
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

  const update = React.useCallback(
    (partial: Partial<CommandeListingView>) => {
      commit({ ...intentRef.current, ...partial })
    },
    [commit]
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

  return { view, queryDraft, onQueryChange, update, reset }
}
