// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogsProvider, useAuthDialogs } from "./auth-dialogs-context"
import { RequireAuth } from "./require-auth"
import { UrlAuthDialog } from "./url-auth-dialog"

const { searchParamsState, sessionState } = vi.hoisted(() => ({
  searchParamsState: {
    value: new URLSearchParams(),
    sync(query: string) {
      this.value = new URLSearchParams(query)
    },
  },
  sessionState: {
    value: { data: null as { user: { id: string } } | null, isPending: false },
  },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsState.value,
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/client", () => ({
  useSession: () => sessionState.value,
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let originalReplaceState: typeof window.history.replaceState

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/panier")
  searchParamsState.sync(window.location.search)
  sessionState.value = { data: null, isPending: false }
  originalReplaceState = window.history.replaceState.bind(window.history)
  window.history.replaceState = (data, unused, url) => {
    originalReplaceState(data, unused, url)
    searchParamsState.sync(
      new URL(url ?? window.location.href, window.location.origin).search
    )
  }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  window.history.replaceState = originalReplaceState
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function rerender(element: ReactElement) {
  act(() => roots[roots.length - 1].render(element))
}

function Probe() {
  const { dialog, close } = useAuthDialogs()
  return (
    <div>
      <div data-dialog={dialog ?? "none"} />
      <button type="button" onClick={close}>
        close
      </button>
    </div>
  )
}

function gateOnlyHarness() {
  return (
    <AuthDialogsProvider>
      <Probe />
      <RequireAuth />
    </AuthDialogsProvider>
  )
}

function fullHarness() {
  return (
    <AuthDialogsProvider>
      <Probe />
      <RequireAuth />
      <UrlAuthDialog />
    </AuthDialogsProvider>
  )
}

function dialog() {
  return container.querySelector("[data-dialog]")?.getAttribute("data-dialog")
}

function signInButton() {
  return container.querySelector<HTMLButtonElement>('button[data-slot="button"]')
}

function closeButton() {
  return container.querySelector<HTMLButtonElement>("button:not([data-slot])")
}

async function flushDeferredUrlSync() {
  await act(async () => {})
}

describe("RequireAuth", () => {
  it("renders a placeholder with a Se connecter button and a catalog link", async () => {
    render(gateOnlyHarness())
    await flushDeferredUrlSync()

    expect(container.textContent).toContain("Connectez-vous pour continuer")
    expect(signInButton()?.textContent).toBe("Se connecter")
    expect(container.querySelector('a[href="/"]')).not.toBeNull()
  })

  it("adds ?open=login and ?next=<current path> on mount, without navigating", async () => {
    render(gateOnlyHarness())
    await flushDeferredUrlSync()

    const url = new URL(window.location.href)
    expect(url.pathname).toBe("/panier")
    expect(url.searchParams.get("open")).toBe("login")
    expect(url.searchParams.get("next")).toBe("/panier")
  })

  it("preserves an existing validated ?next=", async () => {
    window.history.replaceState(null, "", "/panier?next=/profil")
    searchParamsState.sync(window.location.search)

    render(gateOnlyHarness())
    await flushDeferredUrlSync()

    expect(new URL(window.location.href).searchParams.get("next")).toBe(
      "/profil"
    )
  })

  it("replaces an invalid ?next= with the current path", async () => {
    window.history.replaceState(null, "", "/panier?next=//evil.example")
    searchParamsState.sync(window.location.search)

    render(gateOnlyHarness())
    await flushDeferredUrlSync()

    expect(new URL(window.location.href).searchParams.get("next")).toBe(
      "/panier"
    )
  })

  it("computes ?next= from the remaining query params, dropping open and next", async () => {
    window.history.replaceState(null, "", "/panier?ville=casa&open=signup")
    searchParamsState.sync(window.location.search)

    render(gateOnlyHarness())
    await flushDeferredUrlSync()

    const url = new URL(window.location.href)
    expect(url.searchParams.get("next")).toBe("/panier?ville=casa")
    expect(url.searchParams.get("open")).toBe("login")
  })

  it("leaves the URL untouched when it already has ?open=login and a valid ?next=", async () => {
    window.history.replaceState(null, "", "/panier?next=/panier&open=login")
    const spy = vi.spyOn(window.history, "replaceState")

    render(gateOnlyHarness())
    await flushDeferredUrlSync()

    expect(spy).not.toHaveBeenCalled()
  })

  it("re-sets ?open=login when Se connecter is clicked", async () => {
    render(gateOnlyHarness())
    await flushDeferredUrlSync()
    act(() => closeButton()!.click())

    act(() => signInButton()!.click())

    expect(new URL(window.location.href).searchParams.get("open")).toBe(
      "login"
    )
  })
})

describe("RequireAuth with UrlAuthDialog", () => {
  it("opens the login dialog on mount, with ?next=<current path>", async () => {
    render(fullHarness())
    await flushDeferredUrlSync()
    rerender(fullHarness())

    expect(dialog()).toBe("login")
    expect(new URL(window.location.href).searchParams.get("next")).toBe(
      "/panier"
    )
  })

  it("reopens the login dialog via Se connecter after the dialog was closed", async () => {
    render(fullHarness())
    await flushDeferredUrlSync()
    rerender(fullHarness())
    expect(dialog()).toBe("login")

    act(() => closeButton()!.click())
    expect(dialog()).toBe("none")

    act(() => signInButton()!.click())
    rerender(fullHarness())
    expect(dialog()).toBe("login")
  })
})
