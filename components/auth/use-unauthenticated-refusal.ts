"use client"

import { useEffect } from "react"

import { useAuthUrlSync } from "@/components/auth/use-auth-url-sync"

export function useUnauthenticatedRefusal(
  state: { unauthenticated?: true } | undefined
) {
  const { openLoginForCurrentPage } = useAuthUrlSync()

  useEffect(() => {
    if (!state?.unauthenticated) return
    openLoginForCurrentPage()
  }, [state, openLoginForCurrentPage])
}
