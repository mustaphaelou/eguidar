// @vitest-environment happy-dom
import {
  flush,
  mockNextLink,
  mockNextNavigation,
  resetNavigation,
} from "./test-utils"
import { act, Suspense } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogsProvider } from "./auth-dialogs"
import { RequireAuth } from "./require-auth"
import { SignInDialog } from "./sign-in-dialog"

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    value: { data: null as { user: { id: string } } | null, isPending: false },
  },
}))

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

vi.mock("@/components/auth/turnstile", () => ({
  Turnstile: () => null,
}))

vi.mock("@/lib/client", () => ({
  useSession: () => sessionState.value,
  authClient: {
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    emailOtp: {
      verifyEmail: vi.fn(),
      sendVerificationOtp: vi.fn(),
    },
  },
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let currentElement: (() => ReactElement) | null = null

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/panier")
  sessionState.value = { data: null, isPending: false }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  currentElement = null
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function render(element: () => ReactElement) {
  currentElement = element
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element()))
}

function rerender() {
  act(() => {
    if (currentElement) roots[roots.length - 1].render(currentElement())
  })
}

function gateOnlyHarness() {
  return (
    <AuthDialogsProvider>
      <RequireAuth />
    </AuthDialogsProvider>
  )
}

function fullHarness() {
  return (
    <AuthDialogsProvider>
      <RequireAuth />
      <Suspense fallback={null}>
        <SignInDialog hasGoogle={false} hasApple={false} />
      </Suspense>
    </AuthDialogsProvider>
  )
}

function dialog() {
  return document.querySelector('[data-slot="dialog-content"]')
}

function signInButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[data-slot="button"]'
  )
}

function closeButton() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Fermer")
  )
}

describe("RequireAuth", () => {
  it("renders a placeholder with a Se connecter button and a catalog link", async () => {
    render(() => gateOnlyHarness())
    await flush()

    expect(container.textContent).toContain("Connectez-vous pour continuer")
    expect(signInButton()?.textContent).toBe("Se connecter")
    expect(container.querySelector('a[href="/"]')).not.toBeNull()
  })

  it("adds ?open=login and ?next=<current path> on mount, without navigating", async () => {
    render(() => gateOnlyHarness())
    await flush()

    const url = new URL(window.location.href)
    expect(url.pathname).toBe("/panier")
    expect(url.searchParams.get("open")).toBe("login")
    expect(url.searchParams.get("next")).toBe("/panier")
  })

  it("preserves an existing validated ?next=", async () => {
    window.history.replaceState(null, "", "/panier?next=/profil")

    render(() => gateOnlyHarness())
    await flush()

    expect(new URL(window.location.href).searchParams.get("next")).toBe(
      "/profil"
    )
  })

  it("replaces an invalid ?next= with the current path", async () => {
    window.history.replaceState(null, "", "/panier?next=//evil.example")

    render(() => gateOnlyHarness())
    await flush()

    expect(new URL(window.location.href).searchParams.get("next")).toBe(
      "/panier"
    )
  })

  it("computes ?next= from the remaining query params, dropping open and next", async () => {
    window.history.replaceState(null, "", "/panier?ville=casa&open=signup")

    render(() => gateOnlyHarness())
    await flush()

    const url = new URL(window.location.href)
    expect(url.searchParams.get("next")).toBe("/panier?ville=casa")
    expect(url.searchParams.get("open")).toBe("login")
  })

  it("leaves the URL untouched when it already has ?open=login and a valid ?next=", async () => {
    window.history.replaceState(null, "", "/panier?next=/panier&open=login")
    const spy = vi.spyOn(window.history, "replaceState")

    render(() => gateOnlyHarness())
    await flush()

    expect(spy).not.toHaveBeenCalled()
  })

  it("re-sets ?open=login when Se connecter is clicked", async () => {
    render(() => gateOnlyHarness())
    await flush()

    act(() => signInButton()!.click())

    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
  })
})

describe("RequireAuth with the Connexion modal", () => {
  it("opens the login dialog on mount, with ?next=<current path>", async () => {
    render(() => fullHarness())
    await flush()
    rerender()

    expect(dialog()).not.toBeNull()
    expect(new URL(window.location.href).searchParams.get("next")).toBe(
      "/panier"
    )
  })

  it("keeps the shopper on the gated page with the refusal placeholder after dismissal, without redirecting", async () => {
    render(() => fullHarness())
    await flush()
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(container.textContent).toContain("Connectez-vous pour continuer")
    expect(new URL(window.location.href).pathname).toBe("/panier")
    expect(new URL(window.location.href).searchParams.has("open")).toBe(false)
    expect(new URL(window.location.href).searchParams.has("next")).toBe(false)

    rerender()

    expect(dialog()).toBeNull()
    expect(container.textContent).toContain("Connectez-vous pour continuer")
  })

  it("reopens the login dialog via Se connecter after the dialog was closed", async () => {
    render(() => fullHarness())
    await flush()
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => closeButton()!.click())
    rerender()
    expect(dialog()).toBeNull()
    expect(new URL(window.location.href).searchParams.has("open")).toBe(false)

    act(() => signInButton()!.click())
    await flush()
    rerender()
    expect(dialog()).not.toBeNull()
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
  })
})
