// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { useSearchParams } from "next/navigation"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseAuthParams } from "@/lib/lien-de-connexion"
import { AuthDialogsProvider } from "@/components/auth/auth-dialogs"
import { SignInButton } from "./sign-in-button"

vi.mock("next/navigation", () => ({
  usePathname: () => new URL(window.location.href).pathname,
  useRouter: () => ({
    push: (url: string) => {
      window.history.pushState(null, "", url)
    },
    replace: (url: string) => {
      window.history.replaceState(null, "", url)
    },
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let currentElement: (() => ReactElement) | null = null

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/")
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  currentElement = null
  container.remove()
})

function render(element: () => ReactElement) {
  currentElement = element
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element()))
}

function Probe() {
  const searchParams = useSearchParams()
  const { dialog } = parseAuthParams(searchParams)
  return <div data-dialog={dialog ?? "none"} />
}

function renderWithProvider() {
  render(() => (
    <AuthDialogsProvider>
      <Probe />
      <SignInButton />
    </AuthDialogsProvider>
  ))
}

function signInButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Connexion"]'
  )!
}

function clickAndSync(target: HTMLElement) {
  act(() => {
    target.click()
    if (currentElement) roots[roots.length - 1].render(currentElement())
  })
}

describe("SignInButton", () => {
  it("renders a button labelled Connexion", () => {
    renderWithProvider()

    expect(signInButton().tagName).toBe("BUTTON")
  })

  it("opens the login dialog in place on click, without navigating", () => {
    renderWithProvider()

    clickAndSync(signInButton())

    expect(
      container.querySelector("[data-dialog]")!.getAttribute("data-dialog")
    ).toBe("login")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
    expect(window.location.pathname).toBe("/")
  })
})
