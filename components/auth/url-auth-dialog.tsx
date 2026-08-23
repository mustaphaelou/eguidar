"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"

import { useSession } from "@/lib/client"
import { useAuthDialogs } from "@/components/auth/auth-dialogs-context"
import {
  parseAuthParams,
  withoutAuthParams,
} from "@/lib/lien-de-connexion"
import { replaceUrl } from "@/components/auth/sync-url"

function removeOpenParam() {
  replaceUrl((url) => withoutAuthParams(url.href))
}

export function UrlAuthDialog() {
  return (
    <Suspense fallback={null}>
      <UrlAuthDialogInner />
    </Suspense>
  )
}

function UrlAuthDialogInner() {
  const searchParams = useSearchParams()
  const { data: session, isPending } = useSession()
  const { dialog, openLogin, openSignUp, close } = useAuthDialogs()
  const target = parseAuthParams(searchParams).dialog

  useEffect(() => {
    if (isPending) return
    if (!target || session) {
      if (dialog) close()
      removeOpenParam()
      return
    }
    if (dialog !== target) {
      if (target === "login") openLogin()
      else openSignUp()
    }
  }, [target, isPending, session, dialog, openLogin, openSignUp, close])

  return null
}
