// @vitest-environment happy-dom
import {
  flush,
  mockNextLink,
  mockNextNavigation,
  resetNavigation,
  setInputValue,
} from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthDialogsProvider, useAuthDialogs } from "./auth-dialogs"
import { SignInDialog } from "./sign-in-dialog"
import { SignUpDialog } from "./sign-up-dialog"
import { authClient } from "@/lib/client"

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
  useSession: () => ({ data: null, isPending: false }),
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
  resetNavigation("/")
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  currentElement = null
  container.remove()
  vi.restoreAllMocks()
})

function render(element: () => ReactElement) {
  currentElement = element
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element()))
}

async function clickAndSync(target: HTMLElement) {
  act(() => {
    target.click()
  })
  await flush()
  act(() => {
    if (currentElement) roots[roots.length - 1].render(currentElement())
  })
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
  render(() => (
    <AuthDialogsProvider>
      {harness}
      <SignInDialog hasGoogle={false} hasApple={false} />
      <SignUpDialog />
    </AuthDialogsProvider>
  ))
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
  it("opens from the provider and shows the login dialog", async () => {
    renderWithDialogs(<Harness />)

    expect(dialog()).toBeNull()
    await clickAndSync(openButton())

    expect(dialog()).not.toBeNull()
    expect(title()).toBe("Connectez-vous pour continuer")
    expect(emailInput()).not.toBeNull()
  })

  it("writes ?open=login to the URL when opened and clears it on close", async () => {
    renderWithDialogs(<Harness />)

    await clickAndSync(openButton())
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      if (currentElement) roots[roots.length - 1].render(currentElement())
    })

    expect(dialog()).toBeNull()
    expect(new URL(window.location.href).searchParams.has("open")).toBe(false)
  })

  it("swaps to the sign-up dialog with the entered email prefilled", async () => {
    renderWithDialogs(<Harness />)

    await clickAndSync(openButton())
    setInputValue(emailInput()!, "swap@example.com")
    await clickAndSync(swapButton()!)

    expect(dialog()).not.toBeNull()
    expect(title()).toBe("Créez votre compte pour continuer")
    expect(
      (dialog()?.querySelector('input[type="email"]') as HTMLInputElement)
        ?.value
    ).toBe("swap@example.com")
    expect(new URL(window.location.href).searchParams.get("open")).toBe(
      "signup"
    )
  })

  it("opens the sign-up dialog and swaps back to login", async () => {
    renderWithDialogs(<SwapHarness />)

    await clickAndSync(
      container.querySelector<HTMLButtonElement>("[data-open-signup]")!
    )

    expect(title()).toBe("Créer un compte")
    await clickAndSync(
      document.querySelector<HTMLButtonElement>(
        '[data-slot="dialog-description"] button'
      )!
    )

    expect(title()).toBe("Connectez-vous pour continuer")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
  })

  it("renders the popup with aria-modal", async () => {
    renderWithDialogs(<Harness />)

    await clickAndSync(openButton())

    expect(
      document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")
    ).toBe("true")
  })

  it("shows a contextual title when the destination leads to an order", async () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/produit/tableau-atlas"
    )
    renderWithDialogs(<Harness />)

    await clickAndSync(openButton())

    expect(title()).toBe("Connectez-vous pour finaliser votre commande")
  })

  it("falls back to the generic continue title for non-commerce destinations", async () => {
    window.history.replaceState(null, "", "/?open=signup&next=/compte")
    renderWithDialogs(<SwapHarness />)

    await clickAndSync(
      container.querySelector<HTMLButtonElement>("[data-open-signup]")!
    )

    expect(title()).toBe("Créez votre compte pour continuer")
  })

  it("blocks submit with field issues and does not call the API when invalid", async () => {
    renderWithDialogs(<Harness />)

    await clickAndSync(openButton())
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

  it("reports an invalid email format inline", async () => {
    renderWithDialogs(<Harness />)

    await clickAndSync(openButton())
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
