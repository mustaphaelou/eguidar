"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  type AuthDialogName,
  urlWouldChange,
  withAuthParams,
  withoutAuthSearchParams,
} from "@/lib/lien-de-connexion"

function currentAddress(pathname: string, searchParams: URLSearchParams) {
  const search = searchParams.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function useAuthUrlSync() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const openAuthDialog = useCallback(
    (dialog: AuthDialogName, next?: string) => {
      const current = currentAddress(pathname, searchParams)
      const updated = withAuthParams(current, { dialog, next })
      if (!urlWouldChange(updated, current)) return
      router.replace(updated, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  const clearAuthParams = useCallback(() => {
    const current = currentAddress(pathname, searchParams)
    const cleaned = withoutAuthSearchParams(searchParams)
    const updated = cleaned ? `${pathname}${cleaned}` : pathname
    if (!urlWouldChange(updated, current)) return
    router.replace(updated, { scroll: false })
  }, [router, pathname, searchParams])

  return { openAuthDialog, clearAuthParams }
}
