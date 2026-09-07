// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthUrlSanitizer } from "./auth-url-sanitizer"

const { params, sessionState, adopt } = vi.hoisted(() => ({
  params: new URLSearchParams(),
  sessionState: {
    value: { data: null as { user: { id: string } } | null, isPending: false },
  },
  adopt(search: string) {
    const next = new URLSearchParams(search)
    for (const key of [...params.keys()]) params.delete(key)
    for (const [key, value] of next) params.set(key, value)
  },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => new URL(window.location.href).pathname,
  useRouter: () => ({
    replace: (url: string) => {
      window.history.replaceState(null, "", url)
      adopt(new URL(url, window.location.origin).search)
    },
  }),
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

function locationParams() {
  return new URL(window.location.href).searchParams
}

describe("AuthUrlSanitizer", () => {
  it("leaves a valid Lien de connexion untouched for a Visiteur", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier&q=chaussures")
    adopt(window.location.search)

    render(<AuthUrlSanitizer />)

    expect(locationParams().get("open")).toBe("login")
    expect(locationParams().get("next")).toBe("/panier")
    expect(locationParams().get("q")).toBe("chaussures")
  })

  it("silently sanitizes the URL when a session already exists", () => {
    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    window.history.replaceState(null, "", "/?open=login&next=/panier&q=chaussures")
    adopt(window.location.search)

    render(<AuthUrlSanitizer />)

    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("q")).toBe("chaussures")
  })

  it("cleans up an invalid ?open= value", () => {
    window.history.replaceState(null, "", "/?open=bogus&q=chaussures")
    adopt(window.location.search)

    render(<AuthUrlSanitizer />)

    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("q")).toBe("chaussures")
  })

  it("waits for the session check before sanitizing", () => {
    sessionState.value = { data: null, isPending: true }
    window.history.replaceState(null, "", "/?open=login")
    adopt(window.location.search)

    render(<AuthUrlSanitizer />)
    expect(locationParams().get("open")).toBe("login")

    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    act(() => roots[roots.length - 1].render(<AuthUrlSanitizer />))

    expect(locationParams().get("open")).toBeNull()
  })

  it("does nothing when there is no ?open=", () => {
    render(<AuthUrlSanitizer />)

    expect(new URL(window.location.href).search).toBe("")
  })
})
