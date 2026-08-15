"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"

import { useSession } from "@/lib/client"
import {
  useAuthDialogs,
  type AuthDialogName,
} from "@/components/auth/auth-dialogs-context"

const OPEN_TO_DIALOG: Partial<Record<string, AuthDialogName>> = {
  login: "login",
  signup: "signup",
}

function removeOpenParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has("open")) return
  url.searchParams.delete("open")
  window.history.replaceState(null, "", url.toString())
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
  const open = searchParams.get("open")

  useEffect(() => {
    if (isPending) return
    const target = OPEN_TO_DIALOG[open ?? ""]
    if (!target) {
      if (dialog) close()
      if (open !== null) removeOpenParam()
      return
    }
    if (session) {
      if (dialog) close()
      removeOpenParam()
      return
    }
    if (dialog !== target) {
      if (target === "login") openLogin()
      else openSignUp()
    }
  }, [open, isPending, session, dialog, openLogin, openSignUp, close])

  return null
}
