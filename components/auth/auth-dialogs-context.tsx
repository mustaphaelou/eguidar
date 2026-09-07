"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { useSearchParams } from "next/navigation"

import {
  type AuthDialogName,
  parseAuthParams,
} from "@/lib/lien-de-connexion"
import { useSession } from "@/lib/client"
import { useAuthUrlSync } from "@/components/auth/use-auth-url-sync"

type AuthDialogsContextValue = {
  email: string
  openLogin: (email?: string) => void
  openSignUp: (email?: string) => void
  close: () => void
}

const AuthDialogsContext = createContext<AuthDialogsContextValue | null>(null)

export function AuthDialogsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [email, setEmail] = useState("")
  const { openAuthDialog, clearAuthParams } = useAuthUrlSync()

  const openLogin = useCallback(
    (prefillEmail?: string) => {
      if (prefillEmail !== undefined) setEmail(prefillEmail)
      openAuthDialog("login")
    },
    [openAuthDialog]
  )

  const openSignUp = useCallback(
    (prefillEmail?: string) => {
      if (prefillEmail !== undefined) setEmail(prefillEmail)
      openAuthDialog("signup")
    },
    [openAuthDialog]
  )

  const close = useCallback(() => {
    setEmail("")
    clearAuthParams()
  }, [clearAuthParams])

  const value = useMemo(
    () => ({ email, openLogin, openSignUp, close }),
    [email, openLogin, openSignUp, close]
  )

  return (
    <AuthDialogsContext.Provider value={value}>
      {children}
    </AuthDialogsContext.Provider>
  )
}

export function useAuthDialogOpen(dialog: AuthDialogName): boolean {
  const searchParams = useSearchParams()
  const { data: session, isPending } = useSession()
  if (isPending || session) return false
  return parseAuthParams(searchParams).dialog === dialog
}

export function useAuthDialogs() {
  const context = useContext(AuthDialogsContext)
  if (!context) {
    throw new Error("useAuthDialogs must be used within an AuthDialogsProvider")
  }
  return context
}
