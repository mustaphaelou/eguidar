// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSearchParams } from "next/navigation"

import { parseAuthParams } from "@/lib/lien-de-connexion"
import { useAuthUrlSync } from "./use-auth-url-sync"

const { params, replaceSpy, adopt } = vi.hoisted(() => {
  const params = new URLSearchParams()
  const replaceSpy = vi.fn()
  return {
    params,
    replaceSpy,
    adopt(search: string) {
      const next = new URLSearchParams(search)
      for (const key of [...params.keys()]) params.delete(key)
      for (const [key, value] of next) params.set(key, value)
    },
  }
})

vi.mock("next/navigation", () => ({
  usePathname: () => new URL(window.location.href).pathname,
  useRouter: () => ({
    replace: (url: string, options: { scroll: boolean }) => {
      replaceSpy(url, options)
      const parsed = new URL(url, window.location.origin)
      const address = `${parsed.pathname}${parsed.search}${parsed.hash}`
      window.history.replaceState(null, "", address)
      adopt(parsed.search)
    },
  }),
  useSearchParams: () => params,
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/panier?q=chaussures")
  adopt(window.location.search)
  replaceSpy.mockClear()
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

function Harness() {
  const searchParams = useSearchParams()
  const { openAuthDialog, clearAuthParams, openLoginForCurrentPage } =
    useAuthUrlSync()
  const { dialog } = parseAuthParams(searchParams)
  return (
    <div>
      <div data-dialog={dialog ?? "none"} />
      <button
        type="button"
        data-open-login
        onClick={() => openAuthDialog("login", "/panier")}
      />
      <button
        type="button"
        data-open-signup
        onClick={() => openAuthDialog("signup")}
      />
      <button
        type="button"
        data-open-login-page
        onClick={() => openLoginForCurrentPage()}
      />
      <button type="button" data-clear onClick={() => clearAuthParams()} />
    </div>
  )
}

function dialog() {
  return container.querySelector("[data-dialog]")?.getAttribute("data-dialog")
}

function click(name: string) {
  act(() =>
    container.querySelector<HTMLButtonElement>(`[data-${name}]`)!.click()
  )
}

function locationParams() {
  return new URL(window.location.href).searchParams
}

describe("useAuthUrlSync", () => {
  it("opens the Connexion modal through the client router and notifies search-param consumers", () => {
    render(<Harness />)

    click("open-login")

    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith(
      "/panier?q=chaussures&open=login&next=%2Fpanier",
      { scroll: false }
    )
    expect(locationParams().get("open")).toBe("login")
    expect(locationParams().get("next")).toBe("/panier")
    expect(locationParams().get("q")).toBe("chaussures")

    rerender(<Harness />)

    expect(dialog()).toBe("login")
  })

  it("opens the Inscription modal without a Destination post-connexion", () => {
    render(<Harness />)

    click("open-signup")

    expect(replaceSpy).toHaveBeenCalledWith(
      "/panier?q=chaussures&open=signup",
      {
        scroll: false,
      }
    )

    rerender(<Harness />)

    expect(dialog()).toBe("signup")
  })

  it("clears auth params through the client router, keeping unrelated params and notifying consumers", () => {
    window.history.replaceState(
      null,
      "",
      "/panier?open=login&next=/profil&q=chaussures"
    )
    adopt(window.location.search)
    render(<Harness />)
    rerender(<Harness />)
    expect(dialog()).toBe("login")

    click("clear")

    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith("/panier?q=chaussures", {
      scroll: false,
    })
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("q")).toBe("chaussures")

    rerender(<Harness />)

    expect(dialog()).toBe("none")
  })

  it("clears auth params down to the bare pathname when nothing else remains", () => {
    window.history.replaceState(null, "", "/panier?open=login&next=/panier")
    adopt(window.location.search)
    render(<Harness />)

    click("clear")

    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith("/panier", {
      scroll: false,
    })
    expect(new URL(window.location.href).search).toBe("")
  })

  it("does not navigate when there are no auth params to clear", () => {
    render(<Harness />)

    click("clear")

    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it("does not navigate when the requested Lien de connexion is already in the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/panier?open=login&next=%2Fpanier&q=chaussures"
    )
    adopt(window.location.search)
    render(<Harness />)

    click("open-login")

    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it("opens the Connexion modal for the current page as Destination post-connexion", () => {
    render(<Harness />)

    click("open-login-page")

    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith(
      "/panier?q=chaussures&open=login&next=%2Fpanier%3Fq%3Dchaussures",
      { scroll: false }
    )
  })

  it("reuses an existing validated Destination post-connexion", () => {
    window.history.replaceState(null, "", "/panier?next=/profil")
    adopt(window.location.search)
    render(<Harness />)

    click("open-login-page")

    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith(
      "/panier?next=%2Fprofil&open=login",
      { scroll: false }
    )
  })

  it("replaces an invalid Destination post-connexion with the current page address", () => {
    window.history.replaceState(null, "", "/panier?next=//evil.example")
    adopt(window.location.search)
    render(<Harness />)

    click("open-login-page")

    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith(
      "/panier?next=%2Fpanier&open=login",
      { scroll: false }
    )
  })

  it("notifies search-param consumers of navigation to URLs with and without auth params", () => {
    render(<Harness />)
    expect(dialog()).toBe("none")

    window.history.replaceState(null, "", "/?open=signup&next=/compte")
    adopt(window.location.search)
    rerender(<Harness />)
    expect(dialog()).toBe("signup")

    window.history.replaceState(null, "", "/")
    adopt(window.location.search)
    rerender(<Harness />)
    expect(dialog()).toBe("none")
  })
})
