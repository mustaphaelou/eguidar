"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import {
  type AuthDialogName,
  withAuthParams,
  withoutAuthParams,
} from "@/lib/lien-de-connexion"
import { replaceUrl } from "@/components/auth/sync-url"

type AuthDialogsContextValue = {
  dialog: AuthDialogName | null
  email: string
  openLogin: (email?: string) => void
  openSignUp: (email?: string) => void
  close: () => void
}

const AuthDialogsContext = createContext<AuthDialogsContextValue | null>(null)

function syncOpenParam(dialog: AuthDialogName | null) {
  replaceUrl((url) =>
    dialog ? withAuthParams(url.href, { dialog }) : withoutAuthParams(url.href)
  )
}

export function AuthDialogsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [dialog, setDialog] = useState<AuthDialogName | null>(null)
  const [email, setEmail] = useState("")

  const openLogin = useCallback((prefillEmail?: string) => {
    if (prefillEmail !== undefined) setEmail(prefillEmail)
    setDialog("login")
    syncOpenParam("login")
  }, [])

  const openSignUp = useCallback((prefillEmail?: string) => {
    if (prefillEmail !== undefined) setEmail(prefillEmail)
    setDialog("signup")
    syncOpenParam("signup")
  }, [])

  const close = useCallback(() => {
    setDialog(null)
    setEmail("")
    syncOpenParam(null)
  }, [])

  const value = useMemo(
    () => ({ dialog, email, openLogin, openSignUp, close }),
    [dialog, email, openLogin, openSignUp, close]
  )

  return (
    <AuthDialogsContext.Provider value={value}>
      {children}
    </AuthDialogsContext.Provider>
  )
}

export function useAuthDialogs() {
  const context = useContext(AuthDialogsContext)
  if (!context) {
    throw new Error("useAuthDialogs must be used within an AuthDialogsProvider")
  }
  return context
}
