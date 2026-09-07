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
  const { open, dialog } = parseAuthParams(searchParams)

  useEffect(() => {
    if (isPending) return
    if (open !== null && (session || !dialog)) clearAuthParams()
  }, [open, dialog, isPending, session, clearAuthParams])

  return null
}
