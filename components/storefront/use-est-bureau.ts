"use client"

import * as React from "react"

const REQUETE_BUREAU = "(min-width: 1024px)"

export function useEstBureau() {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const mediaQuery = window.matchMedia(REQUETE_BUREAU)
    mediaQuery.addEventListener("change", onStoreChange)
    return () => mediaQuery.removeEventListener("change", onStoreChange)
  }, [])

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REQUETE_BUREAU).matches,
    () => true
  )
}
