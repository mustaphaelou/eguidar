// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogs } from "./auth-dialogs"
import { SignInButton } from "@/components/storefront/sign-in-button"

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    value: { data: null as { user: { id: string } } | null, isPending: false },
  },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => new URL(window.location.href).pathname,
  useRouter: () => ({
    replace: (url: string) => {
      window.history.replaceState(null, "", url)
    },
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
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
  window.history.replaceState(null, "", "/")
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

function storefront() {
  return (
    <AuthDialogs>
      <SignInButton />
    </AuthDialogs>
  )
}

function headerButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Connexion"]'
  )!
}

function dialog() {
  return document.querySelector('[data-slot="dialog-content"]')
}

function closeButton() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Fermer")
  )
}

function locationParams() {
  return new URL(window.location.href).searchParams
}

describe("AuthDialogs", () => {
  it("opens the Connexion modal from the header user button and keeps it open", () => {
    render(() => storefront())
    expect(dialog()).toBeNull()

    act(() => headerButton().click())
    rerender()

    expect(dialog()).not.toBeNull()
    expect(
      document.querySelector('[data-slot="dialog-title"]')?.textContent
    ).toBe("Connexion à Eguidar")
    expect(locationParams().get("open")).toBe("login")

    rerender()

    expect(dialog()).not.toBeNull()
  })

  it("unmounts the modal and cleans open and next from the URL when the close button is clicked", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/produit/tableau-atlas&ville=casa"
    )
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("ville")).toBe("casa")

    rerender()

    expect(dialog()).toBeNull()
  })

  it("opens the Connexion modal from a Lien de connexion in the URL", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier")
    render(() => storefront())
    rerender()

    expect(dialog()).not.toBeNull()
    expect(locationParams().get("open")).toBe("login")
    expect(locationParams().get("next")).toBe("/panier")
  })
})
