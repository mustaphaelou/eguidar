"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"

import { useSession } from "@/lib/client"
import { useAuthDialogs } from "@/components/auth/auth-dialogs-context"
import { parseAuthParams } from "@/lib/lien-de-connexion"
import { useAuthUrlSync } from "@/components/auth/use-auth-url-sync"

export function UrlAuthDialog() {
  return (
    <Suspense fallback={null}>
      <UrlAuthDialogInner />
    </Suspense>
  )
}

function UrlAuthDialogInner() {
  const searchParams = useSearchParams()
  const { clearAuthParams } = useAuthUrlSync()
  const { data: session, isPending } = useSession()
  const { dialog, openLogin, openSignUp, close } = useAuthDialogs()
  const target = parseAuthParams(searchParams).dialog

  useEffect(() => {
    if (isPending) return
    if (!target || session) {
      if (dialog) close()
      clearAuthParams()
      return
    }
    if (dialog !== target) {
      if (target === "login") openLogin()
      else openSignUp()
    }
  }, [
    target,
    isPending,
    session,
    dialog,
    openLogin,
    openSignUp,
    close,
    clearAuthParams,
  ])

  return null
}
