// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogsProvider, useAuthDialogs } from "./auth-dialogs-context"
import { UrlAuthDialog } from "./url-auth-dialog"

const { params, sessionState } = vi.hoisted(() => ({
  params: new URLSearchParams(),
  sessionState: {
    value: { data: null, isPending: false } as {
      data: { user: { id: string } } | null
      isPending: boolean
    },
  },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
}))

vi.mock("@/lib/client", () => ({
  useSession: () => sessionState.value,
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/")
  params.delete("open")
  sessionState.value = { data: null, isPending: false }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
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
  const { dialog } = useAuthDialogs()
  return <div data-dialog={dialog ?? "none"} />
}

function harness() {
  return (
    <AuthDialogsProvider>
      <UrlAuthDialog />
      <Probe />
    </AuthDialogsProvider>
  )
}

function dialog() {
  return container.querySelector("[data-dialog]")?.getAttribute("data-dialog")
}

function openParam() {
  return new URL(window.location.href).searchParams.get("open")
}

describe("UrlAuthDialog", () => {
  it("does nothing when there is no ?open=", () => {
    render(harness())

    expect(dialog()).toBe("none")
    expect(openParam()).toBeNull()
  })

  it("opens the login dialog when ?open=login and keeps the param in the URL", () => {
    params.set("open", "login")

    render(harness())

    expect(dialog()).toBe("login")
    expect(openParam()).toBe("login")
  })

  it("opens the sign-up dialog when ?open=signup", () => {
    params.set("open", "signup")

    render(harness())

    expect(dialog()).toBe("signup")
    expect(openParam()).toBe("signup")
  })

  it("ignores invalid ?open= values and cleans the param up", () => {
    window.history.replaceState(null, "", "/?open=bogus")
    params.set("open", "bogus")

    render(harness())

    expect(dialog()).toBe("none")
    expect(openParam()).toBeNull()
  })

  it("ignores ?open= when a session already exists and cleans the param up", () => {
    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    window.history.replaceState(null, "", "/?open=login")
    params.set("open", "login")

    render(harness())

    expect(dialog()).toBe("none")
    expect(openParam()).toBeNull()
  })

  it("waits for the session check before opening", () => {
    sessionState.value = { data: null, isPending: true }
    params.set("open", "login")

    render(harness())
    expect(dialog()).toBe("none")

    sessionState.value = { data: null, isPending: false }
    rerender(harness())

    expect(dialog()).toBe("login")
  })

  it("closes the dialog when ?open= disappears (browser back)", () => {
    params.set("open", "login")
    render(harness())
    expect(dialog()).toBe("login")

    params.delete("open")
    rerender(harness())

    expect(dialog()).toBe("none")
  })

  it("swaps to the sign-up dialog when ?open= changes", () => {
    params.set("open", "login")
    render(harness())
    expect(dialog()).toBe("login")

    params.set("open", "signup")
    rerender(harness())

    expect(dialog()).toBe("signup")
    expect(openParam()).toBe("signup")
  })
})
