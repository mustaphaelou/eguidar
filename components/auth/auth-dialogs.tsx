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

import { translateConnexionSocialeFailure } from "./auth-form-glue"
import { AuthDialog } from "./auth-dialog"

type AuthDialogsContextValue = {
  email: string
  /**
   * Le fait qu'un flux précédent doit dire au Client, rendu une fois par la
   * modale qui le reçoit. La Vérification de l'e-mail d'une Inscription s'en
   * sert pour annoncer le Compte client créé ; la Session inactive pourra s'en
   * servir pour son avis. Le contrôleur le possède, le panneau le rend.
   */
  avis: string | null
  openLogin: (options?: {
    email?: string
    next?: string
    avis?: string
  }) => void
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

function pageAddressWithoutAuthParams(
  search: string | URLSearchParams
): string {
  return `${currentPathname()}${withoutAuthSearchParams(search)}${currentHash()}`
}

function navigateUnlessUnchanged(
  current: string,
  updated: string,
  navigate: (url: string) => void
): void {
  if (!urlWouldChange(updated, current)) return
  navigate(updated)
}

function modalAllowed(
  open: string | null,
  dialog: AuthDialogName | null,
  { sessionReady, hasSession }: { sessionReady: boolean; hasSession: boolean }
): boolean {
  return sessionReady && open !== null && dialog !== null && !hasSession
}

export function AuthDialogsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [email, setEmail] = useState("")
  const [avis, setAvis] = useState<string | null>(null)
  const router = useRouter()
  const { data: session, isPending } = useSession()

  const openAuthDialog = useCallback(
    (dialog: AuthDialogName, next?: string) => {
      queueMicrotask(() => {
        const current = currentAddress()
        const { next: existingNext } = parseAuthParams(currentSearch())
        const destination = next ?? existingNext
        navigateUnlessUnchanged(
          current,
          withAuthParams(pageAddressWithoutAuthParams(currentSearch()), {
            dialog,
            ...(destination ? { next: destination } : {}),
          }),
          (url) => router.push(url, { scroll: false })
        )
      })
    },
    [router]
  )

  const cleanAuthParams = useCallback(() => {
    setAvis(null)
    const current = currentAddress()
    navigateUnlessUnchanged(
      current,
      pageAddressWithoutAuthParams(currentSearch()),
      (url) => router.replace(url, { scroll: false })
    )
  }, [router])

  const openLogin = useCallback(
    (options?: { email?: string; next?: string; avis?: string }) => {
      setEmail(options?.email ?? "")
      setAvis(options?.avis ?? null)
      const next =
        options?.next ??
        parseAuthParams(currentSearch()).next ??
        pageAddressWithoutAuthParams(currentSearch())
      openAuthDialog("login", next)
    },
    [openAuthDialog]
  )

  const openSignUp = useCallback(
    (options?: { email?: string }) => {
      setEmail(options?.email ?? "")
      setAvis(null)
      openAuthDialog("signup")
    },
    [openAuthDialog]
  )

  const close = useCallback(() => {
    setEmail("")
    cleanAuthParams()
  }, [cleanAuthParams])

  const value = useMemo(
    () => ({ email, avis, openLogin, openSignUp, close }),
    [email, avis, openLogin, openSignUp, close]
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
  const { open, dialog: openDialog } = parseAuthParams(searchParams)
  return modalAllowed(open, openDialog, internals) && openDialog === dialog
}

export function useAuthDialogDestination(): string | null {
  const searchParams = useSearchParams()
  return parseAuthParams(searchParams).next
}

export function usePageAddressWithoutAuthParams(): string {
  const searchParams = useSearchParams()
  return pageAddressWithoutAuthParams(searchParams)
}

export function useAuthDialogError(): string | null {
  const searchParams = useSearchParams()
  return translateConnexionSocialeFailure(parseAuthParams(searchParams).error)
}

export function useAuthDialogErrorDestination(): string {
  const searchParams = useSearchParams()
  const { next } = parseAuthParams(searchParams)
  return withAuthParams(pageAddressWithoutAuthParams(searchParams), {
    dialog: "login",
    ...(next ? { next } : {}),
  })
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
  const { open, dialog, next, error } = parseAuthParams(searchParams)

  useEffect(() => {
    if (!internals) return
    if (!internals.sessionReady) return
    if (open === null && next === null && error === null) return
    if (open !== null && modalAllowed(open, dialog, internals)) return
    internals.cleanAuthParams()
  }, [open, dialog, next, error, internals])

  return null
}

export function AuthDialogs({
  children,
  hasGoogle = false,
  hasFacebook = false,
}: {
  children: React.ReactNode
  hasGoogle?: boolean
  hasFacebook?: boolean
}) {
  return (
    <AuthDialogsProvider>
      {children}
      <Suspense fallback={null}>
        <AuthUrlCleaner />
        <AuthDialog
          dialog="login"
          hasGoogle={hasGoogle}
          hasFacebook={hasFacebook}
        />
        <AuthDialog
          dialog="signup"
          hasGoogle={hasGoogle}
          hasFacebook={hasFacebook}
        />
      </Suspense>
    </AuthDialogsProvider>
  )
}
