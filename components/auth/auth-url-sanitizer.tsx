"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"

import { useSession } from "@/lib/client"
import { parseAuthParams } from "@/lib/lien-de-connexion"
import { useAuthUrlSync } from "@/components/auth/use-auth-url-sync"

export function AuthUrlSanitizer() {
  return (
    <Suspense fallback={null}>
      <AuthUrlSanitizerInner />
    </Suspense>
  )
}

function AuthUrlSanitizerInner() {
  const searchParams = useSearchParams()
  const { clearAuthParams } = useAuthUrlSync()
  const { data: session, isPending } = useSession()
  const hasOpenParam = searchParams.has("open")
  const dialog = parseAuthParams(searchParams).dialog

  useEffect(() => {
    if (isPending) return
    if (hasOpenParam && (session || !dialog)) clearAuthParams()
  }, [hasOpenParam, dialog, isPending, session, clearAuthParams])

  return null
}
