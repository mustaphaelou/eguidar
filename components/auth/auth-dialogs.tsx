"use client"

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"

import {
  type AuthDialogName,
  parseAuthParams,
  urlWouldChange,
  withAuthParams,
  withoutAuthSearchParams,
} from "@/lib/lien-de-connexion"
import { useSession } from "@/lib/client"

import { SignInDialog } from "./sign-in-dialog"
import { SignUpDialog } from "./sign-up-dialog"

type AuthDialogsContextValue = {
  email: string
  openLogin: (options?: { email?: string; next?: string }) => void
  openSignUp: (options?: { email?: string }) => void
  close: () => void
}

type AuthDialogsInternals = {
  sessionReady: boolean
  hasSession: boolean
  cleanAuthParams: () => void
}

const AuthDialogsContext = createContext<AuthDialogsContextValue | null>(null)

const AuthDialogsInternalsContext = createContext<AuthDialogsInternals | null>(
  null
)

function currentPathname(): string {
  return typeof window === "undefined" ? "" : window.location.pathname
}

function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash
}

function currentAddress(): string {
  return `${currentPathname()}${currentSearch()}${currentHash()}`
}

function pageAddressWithoutAuthParams(): string {
  const cleaned = withoutAuthSearchParams(currentSearch())
  return `${currentPathname()}${cleaned}${currentHash()}`
}

function navigateUnlessUnchanged(
  current: string,
  updated: string,
  navigate: (url: string) => void
): void {
  if (!urlWouldChange(updated, current)) return
  navigate(updated)
}

export function AuthDialogsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [email, setEmail] = useState("")
  const router = useRouter()
  const { data: session, isPending } = useSession()

  const openAuthDialog = useCallback(
    (dialog: AuthDialogName, next?: string) => {
      const current = currentAddress()
      navigateUnlessUnchanged(
        current,
        withAuthParams(current, { dialog, next }),
        (url) => router.push(url, { scroll: false })
      )
    },
    [router]
  )

  const cleanAuthParams = useCallback(() => {
    const current = currentAddress()
    navigateUnlessUnchanged(
      current,
      pageAddressWithoutAuthParams(),
      (url) => router.replace(url, { scroll: false })
    )
  }, [router])

  const openLogin = useCallback(
    (options?: { email?: string; next?: string }) => {
      if (options?.email !== undefined) setEmail(options.email)
      const next =
        options?.next ??
        parseAuthParams(currentSearch()).next ??
        pageAddressWithoutAuthParams()
      openAuthDialog("login", next)
    },
    [openAuthDialog]
  )

  const openSignUp = useCallback(
    (options?: { email?: string }) => {
      if (options?.email !== undefined) setEmail(options.email)
      openAuthDialog("signup")
    },
    [openAuthDialog]
  )

  const close = useCallback(() => {
    setEmail("")
    cleanAuthParams()
  }, [cleanAuthParams])

  const value = useMemo(
    () => ({ email, openLogin, openSignUp, close }),
    [email, openLogin, openSignUp, close]
  )

  const internals = useMemo(
    () => ({
      sessionReady: !isPending,
      hasSession: Boolean(session),
      cleanAuthParams,
    }),
    [isPending, session, cleanAuthParams]
  )

  return (
    <AuthDialogsInternalsContext.Provider value={internals}>
      <AuthDialogsContext.Provider value={value}>
        {children}
      </AuthDialogsContext.Provider>
    </AuthDialogsInternalsContext.Provider>
  )
}

export function useAuthDialogOpen(dialog: AuthDialogName): boolean {
  const searchParams = useSearchParams()
  const internals = useContext(AuthDialogsInternalsContext)
  if (!internals) {
    throw new Error(
      "useAuthDialogOpen must be used within an AuthDialogsProvider"
    )
  }
  if (!internals.sessionReady || internals.hasSession) return false
  return parseAuthParams(searchParams).dialog === dialog
}

export function useAuthDialogs() {
  const context = useContext(AuthDialogsContext)
  if (!context) {
    throw new Error("useAuthDialogs must be used within an AuthDialogsProvider")
  }
  return context
}

function AuthUrlCleaner() {
  const searchParams = useSearchParams()
  const internals = useContext(AuthDialogsInternalsContext)
  const { open, dialog } = parseAuthParams(searchParams)

  useEffect(() => {
    if (!internals) return
    if (!internals.sessionReady) return
    if (open !== null && (internals.hasSession || !dialog)) {
      internals.cleanAuthParams()
    }
  }, [open, dialog, internals])

  return null
}

export function AuthDialogs({ children }: { children: React.ReactNode }) {
  return (
    <AuthDialogsProvider>
      {children}
      <Suspense fallback={null}>
        <AuthUrlCleaner />
      </Suspense>
      <Suspense fallback={null}>
        <SignInDialog
          hasGoogle={Boolean(process.env.GOOGLE_CLIENT_ID)}
          hasApple={Boolean(process.env.APPLE_CLIENT_ID)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SignUpDialog />
      </Suspense>
    </AuthDialogsProvider>
  )
}
