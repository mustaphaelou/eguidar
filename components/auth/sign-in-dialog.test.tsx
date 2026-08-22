// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogsProvider, useAuthDialogs } from "./auth-dialogs-context"
import { SignInDialog } from "./sign-in-dialog"
import { SignUpDialog } from "./sign-up-dialog"
import { setInputValue } from "./test-utils"
import { authClient } from "@/lib/client"

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/")
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function Harness({ children }: { children?: React.ReactNode }) {
  const { openLogin } = useAuthDialogs()
  return (
    <>
      <button type="button" onClick={() => openLogin()}>
        open login
      </button>
      {children}
    </>
  )
}

function renderWithDialogs(harness: React.ReactElement) {
  render(
    <AuthDialogsProvider>
      {harness}
      <SignInDialog hasGoogle={false} hasApple={false} />
      <SignUpDialog />
    </AuthDialogsProvider>
  )
}

function dialog() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
}

function title() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-title"]')
    ?.textContent
}

function emailInput() {
  return document.querySelector<HTMLInputElement>('input[type="email"]')
}

function swapButton() {
  return document.querySelector<HTMLButtonElement>(
    '[data-slot="dialog-description"] button'
  )
}

function openButton() {
  return container.querySelector<HTMLButtonElement>('button[type="button"]')!
}

describe("SignInDialog", () => {
  it("opens from the provider and shows the login dialog", () => {
    renderWithDialogs(<Harness />)

    expect(dialog()).toBeNull()
    act(() => openButton().click())

    expect(dialog()).not.toBeNull()
    expect(title()).toBe("Connexion à Eguidar")
    expect(emailInput()).not.toBeNull()
  })

  it("writes ?open=login to the URL when opened and clears it on close", () => {
    renderWithDialogs(<Harness />)

    act(() => openButton().click())
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    expect(dialog()).toBeNull()
    expect(new URL(window.location.href).searchParams.has("open")).toBe(false)
  })

  it("swaps to the sign-up dialog with the entered email prefilled", () => {
    renderWithDialogs(<Harness />)

    act(() => openButton().click())
    setInputValue(emailInput()!, "swap@example.com")
    act(() => swapButton()!.click())

    expect(dialog()).not.toBeNull()
    expect(title()).toBe("Créer un compte")
    expect(
      (dialog()?.querySelector('input[type="email"]') as HTMLInputElement)
        ?.value
    ).toBe("swap@example.com")
    expect(new URL(window.location.href).searchParams.get("open")).toBe(
      "signup"
    )
  })

  it("opens the sign-up dialog and swaps back to login", () => {
    renderWithDialogs(<SwapHarness />)

    act(() =>
      container.querySelector<HTMLButtonElement>("[data-open-signup]")!.click()
    )

    expect(title()).toBe("Créer un compte")
    act(() =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-slot="dialog-description"] button'
        )!
        .click()
    )

    expect(title()).toBe("Connexion à Eguidar")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
  })

  it("renders the popup with aria-modal", () => {
    renderWithDialogs(<Harness />)

    act(() => openButton().click())

    expect(
      document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")
    ).toBe("true")
  })

  it("shows a contextual title when the destination leads to an order", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/produit/tableau-atlas"
    )
    renderWithDialogs(<Harness />)

    act(() => openButton().click())

    expect(title()).toBe("Connectez-vous pour finaliser votre commande")
  })

  it("falls back to the generic continue title for non-commerce destinations", () => {
    window.history.replaceState(null, "", "/?open=signup&next=/compte")
    renderWithDialogs(<SwapHarness />)

    act(() =>
      container.querySelector<HTMLButtonElement>("[data-open-signup]")!.click()
    )

    expect(title()).toBe("Créez votre compte pour continuer")
  })

  it("blocks submit with field issues and does not call the API when invalid", () => {
    renderWithDialogs(<Harness />)

    act(() => openButton().click())
    const submit = dialog()!.querySelector<HTMLButtonElement>(
      'form button[type="submit"]'
    )!
    act(() => submit.click())

    const errors = [
      ...document.querySelectorAll('[data-slot="field-error"]'),
    ].map((el) => el.textContent)
    expect(errors).toContain("Saisissez votre adresse e-mail.")
    expect(errors).toContain("Saisissez votre mot de passe.")
    expect(authClient.signIn.email).not.toHaveBeenCalled()
  })

  it("reports an invalid email format inline", () => {
    renderWithDialogs(<Harness />)

    act(() => openButton().click())
    setInputValue(emailInput()!, "pas-un-email")
    setInputValue(
      dialog()!.querySelector<HTMLInputElement>('input[type="password"]')!,
      "motdepasse"
    )
    act(() =>
      dialog()!
        .querySelector<HTMLButtonElement>('form button[type="submit"]')!
        .click()
    )

    const errors = [
      ...document.querySelectorAll('[data-slot="field-error"]'),
    ].map((el) => el.textContent)
    expect(errors).toContain("Saisissez une adresse e-mail valide.")
    expect(authClient.signIn.email).not.toHaveBeenCalled()
  })
})

function SwapHarness() {
  const { openSignUp } = useAuthDialogs()
  return (
    <button type="button" data-open-signup onClick={() => openSignUp()}>
      open signup
    </button>
  )
}
