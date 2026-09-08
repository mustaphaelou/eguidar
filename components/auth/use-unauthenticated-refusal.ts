"use client"

import { useEffect } from "react"

import { useAuthDialogs } from "@/components/auth/auth-dialogs"

export function useUnauthenticatedRefusal(
  state: { unauthenticated?: true } | undefined
) {
  const { openLogin } = useAuthDialogs()

  useEffect(() => {
    if (!state?.unauthenticated) return
    openLogin()
  }, [state, openLogin])
}
