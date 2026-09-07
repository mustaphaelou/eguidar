"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"

import {
  type AuthDialogName,
  parseAuthParams,
  urlWouldChange,
  withAuthParams,
  withoutAuthSearchParams,
} from "@/lib/lien-de-connexion"

function currentPathname(): string {
  return typeof window === "undefined" ? "" : window.location.pathname
}

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}

function currentAddress(): string {
  return `${currentPathname()}${currentSearch()}`
}

function pageAddressWithoutAuthParams(): string {
  const pathname = currentPathname()
  const search = currentSearch()
  if (!search) return pathname
  const cleaned = withoutAuthSearchParams(search)
  return cleaned ? `${pathname}${cleaned}` : pathname
}

export function useAuthUrlSync() {
  const router = useRouter()

  const openAuthDialog = useCallback(
    (dialog: AuthDialogName, next?: string) => {
      const current = currentAddress()
      const updated = withAuthParams(current, { dialog, next })
      if (!urlWouldChange(updated, current)) return
      router.replace(updated, { scroll: false })
    },
    [router]
  )

  const clearAuthParams = useCallback(() => {
    const current = currentAddress()
    const search = currentSearch()
    if (!search) return
    const cleaned = withoutAuthSearchParams(search)
    const updated = cleaned
      ? `${currentPathname()}${cleaned}`
      : currentPathname()
    if (!urlWouldChange(updated, current)) return
    router.replace(updated, { scroll: false })
  }, [router])

  const openLoginForCurrentPage = useCallback(() => {
    const destination =
      parseAuthParams(currentSearch()).next ?? pageAddressWithoutAuthParams()
    openAuthDialog("login", destination)
  }, [openAuthDialog])

  return { openAuthDialog, clearAuthParams, openLoginForCurrentPage }
}
