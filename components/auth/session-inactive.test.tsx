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

import { SESSION_INACTIVE_SECONDS } from "@/lib/session-constants"

import { AuthDialog } from "./auth-dialog"
import { AuthDialogsProvider } from "./auth-dialogs"
import {
  SESSION_INACTIVE_NOTICE,
  SessionInactiveController,
} from "./session-inactive"

const { sessionState, signOutControl } = vi.hoisted(() => ({
  sessionState: {
    value: { data: null as { user: { id: string } } | null, isPending: false },
  },
  signOutControl: { hang: false, resolve: null as null | (() => void) },
}))

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

vi.mock("@/components/auth/test-de-securite", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/auth/test-de-securite")
  >()),
  useTestDeSecurite: () => ({
    ready: true,
    headers: undefined,
    field: null,
    reset: vi.fn(),
  }),
}))

vi.mock("@/lib/client", () => ({
  useSession: () => sessionState.value,
  signOut: vi.fn(() => {
    if (signOutControl.hang) {
      return new Promise<void>((resolve) => {
        signOutControl.resolve = resolve
      })
    }
    sessionState.value = { data: null, isPending: false }
    return Promise.resolve()
  }),
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

import { signOut } from "@/lib/client"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const IDLE_MS = SESSION_INACTIVE_SECONDS * 1000

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let currentElement: (() => ReactElement) | null = null

function connecter() {
  sessionState.value = { data: { user: { id: "client-1" } }, isPending: false }
}

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/panier")
  signOutControl.hang = false
  signOutControl.resolve = null
  connecter()
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  currentElement = null
  container.remove()
  vi.useRealTimers()
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

function controllerHarness() {
  return (
    <AuthDialogsProvider>
      <SessionInactiveController />
    </AuthDialogsProvider>
  )
}

function controllerWithModalHarness() {
  return (
    <AuthDialogsProvider>
      <SessionInactiveController />
      <Suspense fallback={null}>
        <AuthDialog dialog="login" hasGoogle={false} hasApple={false} />
      </Suspense>
    </AuthDialogsProvider>
  )
}

function notice() {
  return container.querySelector('[role="status"]')
}

function dialog() {
  return document.querySelector('[data-slot="dialog-content"]')
}

function currentUrl() {
  return new URL(window.location.href)
}

async function avancer(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function simulerActivite() {
  act(() => {
    for (const type of [
      "pointerdown",
      "pointermove",
      "touchstart",
      "touchmove",
      "scroll",
      "keydown",
    ]) {
      window.dispatchEvent(new Event(type))
    }
  })
}

function simulerReveil() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

describe("SessionInactiveController", () => {
  it("shows the notice first, then signs out, then opens the Connexion modal over the current page", async () => {
    signOutControl.hang = true
    render(() => controllerWithModalHarness())

    act(() => {
      vi.advanceTimersByTime(IDLE_MS)
    })

    expect(notice()).not.toBeNull()
    expect(container.textContent).toContain(SESSION_INACTIVE_NOTICE)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
    expect(currentUrl().searchParams.has("open")).toBe(false)

    await act(async () => {
      signOutControl.resolve?.()
    })
    sessionState.value = { data: null, isPending: false }
    rerender()
    await flush()

    expect(currentUrl().pathname).toBe("/panier")
    expect(currentUrl().searchParams.get("open")).toBe("login")
    expect(currentUrl().searchParams.get("next")).toBe("/panier")
    expect(dialog()).not.toBeNull()
  })

  it("carries the current query into the relative ?next= destination", async () => {
    window.history.replaceState(null, "", "/panier?ville=casa")
    render(() => controllerHarness())

    await avancer(IDLE_MS)
    await flush()

    expect(currentUrl().pathname).toBe("/panier")
    expect(currentUrl().searchParams.get("open")).toBe("login")
    expect(currentUrl().searchParams.get("next")).toBe("/panier?ville=casa")
  })

  it("does not sign out an actively interacting Client: any activity resets the timer", async () => {
    render(() => controllerHarness())

    await avancer(IDLE_MS - 60_000)
    simulerActivite()
    await avancer(IDLE_MS - 60_000)
    simulerActivite()
    await avancer(IDLE_MS - 60_000)

    expect(signOut).not.toHaveBeenCalled()
    expect(notice()).toBeNull()
    expect(currentUrl().searchParams.has("open")).toBe(false)

    await avancer(60_000)
    await flush()

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it("treats route navigation as activity that resets the timer", async () => {
    render(() => controllerHarness())

    await avancer(IDLE_MS - 60_000)
    act(() => {
      window.history.pushState(null, "", "/checkout")
    })
    rerender()
    await avancer(IDLE_MS - 60_000)

    expect(signOut).not.toHaveBeenCalled()

    await avancer(60_000)
    await flush()

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(currentUrl().searchParams.get("next")).toBe("/checkout")
  })

  it("signs out exactly once even when time keeps passing after expiry", async () => {
    render(() => controllerHarness())

    await avancer(IDLE_MS)
    await flush()
    await avancer(IDLE_MS * 3)
    simulerActivite()
    await avancer(IDLE_MS)
    await flush()

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it("is fully inert for a Visiteur: no notice, no signOut, no URL change", async () => {
    sessionState.value = { data: null, isPending: false }
    render(() => controllerHarness())

    await avancer(IDLE_MS * 5)
    simulerActivite()
    await avancer(IDLE_MS * 5)
    await flush()

    expect(signOut).not.toHaveBeenCalled()
    expect(notice()).toBeNull()
    expect(currentUrl().searchParams.has("open")).toBe(false)
  })

  it("dismisses the notice after a brief moment", async () => {
    render(() => controllerHarness())

    await avancer(IDLE_MS)
    expect(notice()).not.toBeNull()

    await avancer(10_000)

    expect(notice()).toBeNull()
  })

  it("re-arms after reconnexion and expires again on the next idle window", async () => {
    render(() => controllerHarness())

    await avancer(IDLE_MS)
    await flush()
    expect(signOut).toHaveBeenCalledTimes(1)

    connecter()
    rerender()
    simulerActivite()

    await avancer(IDLE_MS - 60_000)
    simulerActivite()
    await avancer(IDLE_MS)
    await flush()

    expect(signOut).toHaveBeenCalledTimes(2)
    expect(notice()).not.toBeNull()
  })

  it("expires on wake after more than 30 minutes of true idle time, exactly like a natural expiry", async () => {
    signOutControl.hang = true
    render(() => controllerWithModalHarness())

    act(() => {
      vi.setSystemTime(Date.now() + IDLE_MS + 60_000)
    })
    simulerReveil()

    expect(notice()).not.toBeNull()
    expect(container.textContent).toContain(SESSION_INACTIVE_NOTICE)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()

    await act(async () => {
      signOutControl.resolve?.()
    })
    sessionState.value = { data: null, isPending: false }
    rerender()
    await flush()

    expect(currentUrl().pathname).toBe("/panier")
    expect(currentUrl().searchParams.get("open")).toBe("login")
    expect(currentUrl().searchParams.get("next")).toBe("/panier")
    expect(dialog()).not.toBeNull()
  })

  it("does nothing on wake after less than 30 minutes and keeps the timer alive on true elapsed time", async () => {
    render(() => controllerHarness())

    act(() => {
      vi.setSystemTime(Date.now() + IDLE_MS - 5 * 60_000)
    })
    simulerReveil()
    await flush()

    expect(signOut).not.toHaveBeenCalled()
    expect(notice()).toBeNull()
    expect(currentUrl().searchParams.has("open")).toBe(false)

    await avancer(4 * 60_000)
    expect(signOut).not.toHaveBeenCalled()

    await avancer(60_000)
    await flush()

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(notice()).not.toBeNull()
  })

  it("never triggers a duplicate expiry when waking past the window after a sign-out already happened", async () => {
    render(() => controllerHarness())

    await avancer(IDLE_MS)
    expect(signOut).toHaveBeenCalledTimes(1)
    await flush()

    act(() => {
      vi.setSystemTime(Date.now() + IDLE_MS * 2)
    })
    simulerReveil()
    simulerReveil()
    await flush()

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(currentUrl().searchParams.has("open")).toBe(true)
  })

  it("does not re-fire when a wake past the window lands while signOut is still in flight", async () => {
    signOutControl.hang = true
    render(() => controllerHarness())

    await avancer(IDLE_MS)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(notice()).not.toBeNull()

    act(() => {
      vi.setSystemTime(Date.now() + IDLE_MS * 2)
    })
    simulerReveil()
    await flush()

    await act(async () => {
      signOutControl.resolve?.()
    })
    sessionState.value = { data: null, isPending: false }
    rerender()
    await flush()

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(currentUrl().searchParams.get("open")).toBe("login")
  })

  describe("SessionInactiveController in the Administration", () => {
    it("expires an idle admin session: notice first, then signOut, then the Connexion modal over the current admin page", async () => {
      window.history.replaceState(null, "", "/admin/commandes")
      signOutControl.hang = true
      render(() => controllerWithModalHarness())

      act(() => {
        vi.advanceTimersByTime(IDLE_MS)
      })

      expect(notice()).not.toBeNull()
      expect(container.textContent).toContain(SESSION_INACTIVE_NOTICE)
      expect(signOut).toHaveBeenCalledTimes(1)
      expect(dialog()).toBeNull()
      expect(currentUrl().searchParams.has("open")).toBe(false)

      await act(async () => {
        signOutControl.resolve?.()
      })
      sessionState.value = { data: null, isPending: false }
      rerender()
      await flush()

      expect(currentUrl().pathname).toBe("/admin/commandes")
      expect(currentUrl().searchParams.get("open")).toBe("login")
      expect(currentUrl().searchParams.get("next")).toBe("/admin/commandes")
      expect(dialog()).not.toBeNull()
    })

    it("resets the timer for admin activity: navigation and keyboard work in admin forms", async () => {
      window.history.replaceState(null, "", "/admin/produits")
      render(() => controllerHarness())

      await avancer(IDLE_MS - 60_000)
      act(() => {
        window.history.pushState(null, "", "/admin/categories")
      })
      rerender()
      await avancer(IDLE_MS - 60_000)
      simulerActivite()
      await avancer(IDLE_MS - 60_000)

      expect(signOut).not.toHaveBeenCalled()
      expect(notice()).toBeNull()
      expect(currentUrl().searchParams.has("open")).toBe(false)

      await avancer(60_000)
      await flush()

      expect(signOut).toHaveBeenCalledTimes(1)
      expect(currentUrl().pathname).toBe("/admin/categories")
      expect(currentUrl().searchParams.get("next")).toBe("/admin/categories")
    })
  })
})
