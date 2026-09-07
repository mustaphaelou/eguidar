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

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash
}

function currentAddress(): string {
  return `${currentPathname()}${currentSearch()}${currentHash()}`
}

function pageAddressWithoutAuthParams(): string {
  const cleaned = withoutAuthSearchParams(currentSearch())
  return `${currentPathname()}${cleaned}${currentHash()}`
}

function navigateUnlessUnchanged(
  current: string,
  updated: string,
  navigate: (url: string) => void
): void {
  if (!urlWouldChange(updated, current)) return
  navigate(updated)
}

export function useAuthUrlSync() {
  const router = useRouter()

  const openAuthDialog = useCallback(
    (dialog: AuthDialogName, next?: string) => {
      const current = currentAddress()
      navigateUnlessUnchanged(
        current,
        withAuthParams(current, { dialog, next }),
        (url) => router.push(url, { scroll: false })
      )
    },
    [router]
  )

  const clearAuthParams = useCallback(() => {
    const current = currentAddress()
    navigateUnlessUnchanged(
      current,
      pageAddressWithoutAuthParams(),
      (url) => router.replace(url, { scroll: false })
    )
  }, [router])

  const openLoginForCurrentPage = useCallback(() => {
    const destination =
      parseAuthParams(currentSearch()).next ?? pageAddressWithoutAuthParams()
    openAuthDialog("login", destination)
  }, [openAuthDialog])

  return { openAuthDialog, clearAuthParams, openLoginForCurrentPage }
}
