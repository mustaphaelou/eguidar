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

function overlay() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  })
}

function submitButton() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.type === "submit"
  )!
}

function swapButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) =>
      button.type === "button" && button.textContent?.includes(label)
  )!
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

  it("silently sanitizes a Lien de connexion for an authenticated Client without mounting any modal", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/panier&q=chaussures"
    )
    ;(window as unknown as Record<string, unknown>).__pageInstance = true
    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    render(() => storefront())
    rerender()

    expect(dialog()).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("q")).toBe("chaussures")
    expect(window.location.pathname).toBe("/")
    expect((window as unknown as Record<string, unknown>).__pageInstance).toBe(
      true
    )
    expect(headerButton()).not.toBeNull()

    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
  })

  it("silently sanitizes Inscription parameters for an authenticated Client without mounting any modal", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=signup&next=/compte&tri=prix"
    )
    ;(window as unknown as Record<string, unknown>).__pageInstance = true
    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    render(() => storefront())
    rerender()

    expect(dialog()).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("tri")).toBe("prix")
    expect((window as unknown as Record<string, unknown>).__pageInstance).toBe(
      true
    )
  })

  it("never flashes the Connexion modal while the session check resolves, then sanitizes", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier")
    sessionState.value = { data: null, isPending: true }
    render(() => storefront())

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBe("login")

    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()

    rerender()

    expect(dialog()).toBeNull()
  })

  it("dismisses the Connexion modal on Escape and cleans open and next from the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/produit/tableau-atlas&ville=casa"
    )
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("ville")).toBe("casa")

    rerender()

    expect(dialog()).toBeNull()
  })

  it("dismisses the Connexion modal on backdrop click and cleans open and next from the URL", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier&tri=prix")
    render(() => storefront())
    rerender()
    expect(overlay()).not.toBeNull()

    act(() => {
      overlay()!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("tri")).toBe("prix")

    rerender()

    expect(dialog()).toBeNull()
  })

  it("dismisses the Inscription modal with the close button, Escape, and the backdrop while cleaning the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=signup&next=/compte&ville=rabat"
    )
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("ville")).toBe("rabat")

    window.history.replaceState(null, "", "/?open=signup")
    rerender()
    expect(dialog()).not.toBeNull()

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()

    window.history.replaceState(null, "", "/?open=signup")
    rerender()
    expect(overlay()).not.toBeNull()

    act(() => {
      overlay()!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
  })

  it("closes cleanly after swapping from Connexion to Inscription without reopening", () => {
    render(() => storefront())

    act(() => headerButton().click())
    rerender()
    expect(locationParams().get("open")).toBe("login")

    act(() => swapButton("Inscrivez-vous").click())
    rerender()

    expect(dialog()).not.toBeNull()
    expect(locationParams().get("open")).toBe("signup")
    expect(
      document.querySelector('[data-slot="dialog-title"]')?.textContent
    ).toBe("Créer un compte")

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()

    rerender()

    expect(dialog()).toBeNull()
  })

  it("closes cleanly after swapping from Inscription to Connexion without reopening", () => {
    window.history.replaceState(null, "", "/?open=signup")
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => swapButton("Se connecter").click())
    rerender()

    expect(locationParams().get("open")).toBe("login")

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()

    rerender()

    expect(dialog()).toBeNull()
  })

  it("resets transient form field errors when the Connexion modal is dismissed and reopened", () => {
    render(() => storefront())

    act(() => headerButton().click())
    rerender()

    act(() => submitButton().click())
    rerender()

    const errors = [
      ...document.querySelectorAll('[data-slot="field-error"]'),
    ].map((errorElement) => errorElement.textContent)
    expect(errors).toContain("Saisissez votre adresse e-mail.")
    expect(errors).toContain("Saisissez votre mot de passe.")

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()

    act(() => headerButton().click())
    rerender()

    expect(dialog()).not.toBeNull()
    expect(document.querySelector('[data-slot="field-error"]')).toBeNull()
    expect(locationParams().get("open")).toBe("login")
  })

  it("leaves no residual auth parameters after rapid consecutive Escape presses", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier")
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
  })
})
