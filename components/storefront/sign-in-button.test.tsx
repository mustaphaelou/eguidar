// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { AuthDialogsProvider, useAuthDialogs } from "@/components/auth/auth-dialogs-context"
import { SignInButton } from "./sign-in-button"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/")
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function Probe() {
  const { dialog } = useAuthDialogs()
  return <div data-dialog={dialog ?? "none"} />
}

function renderWithProvider() {
  render(
    <AuthDialogsProvider>
      <Probe />
      <SignInButton />
    </AuthDialogsProvider>
  )
}

function signInButton() {
  return container.querySelector<HTMLButtonElement>('button[aria-label="Connexion"]')!
}

describe("SignInButton", () => {
  it("renders a button labelled Connexion", () => {
    renderWithProvider()

    expect(signInButton().tagName).toBe("BUTTON")
  })

  it("opens the login dialog in place on click, without navigating", () => {
    renderWithProvider()

    act(() => signInButton().click())

    expect(
      container.querySelector("[data-dialog]")!.getAttribute("data-dialog")
    ).toBe("login")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
    expect(window.location.pathname).toBe("/")
  })
})
