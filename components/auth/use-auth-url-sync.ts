"use client"

import { useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"

import {
  type AuthDialogName,
  parseAuthParams,
  urlWouldChange,
  withAuthParams,
  withoutAuthSearchParams,
} from "@/lib/lien-de-connexion"

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}

function currentAddress(pathname: string): string {
  return `${pathname}${currentSearch()}`
}

function pageAddressWithoutAuthParams(pathname: string): string {
  const search = currentSearch()
  if (!search) return pathname
  const cleaned = withoutAuthSearchParams(search)
  return cleaned ? `${pathname}${cleaned}` : pathname
}

export function useAuthUrlSync() {
  const router = useRouter()
  const pathname = usePathname()

  const openAuthDialog = useCallback(
    (dialog: AuthDialogName, next?: string) => {
      const current = currentAddress(pathname)
      const updated = withAuthParams(current, { dialog, next })
      if (!urlWouldChange(updated, current)) return
      router.replace(updated, { scroll: false })
    },
    [router, pathname]
  )

  const clearAuthParams = useCallback(() => {
    const current = currentAddress(pathname)
    const search = currentSearch()
    if (!search) return
    const cleaned = withoutAuthSearchParams(search)
    const updated = cleaned ? `${pathname}${cleaned}` : pathname
    if (!urlWouldChange(updated, current)) return
    router.replace(updated, { scroll: false })
  }, [router, pathname])

  const openLoginForCurrentPage = useCallback(() => {
    const destination =
      parseAuthParams(currentSearch()).next ??
      pageAddressWithoutAuthParams(pathname)
    openAuthDialog("login", destination)
  }, [openAuthDialog, pathname])

  return { openAuthDialog, clearAuthParams, openLoginForCurrentPage }
}
