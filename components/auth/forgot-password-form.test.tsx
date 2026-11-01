// @vitest-environment happy-dom
import {
  mockNextLink,
  mockNextNavigation,
  resetNavigation,
  setInputValue,
} from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ForgotPasswordForm } from "./forgot-password-form"
import { loginUrl } from "@/lib/lien-de-connexion"

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

vi.mock("@/lib/client", () => ({
  authClient: {
    emailOtp: {
      sendVerificationOtp: vi.fn(async () => ({ data: {}, error: null })),
      resetPassword: vi.fn(),
    },
  },
}))

const captchaStub = vi.hoisted(() => ({
  ready: true,
  reset: vi.fn(),
}))

vi.mock("@/components/auth/test-de-securite", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/auth/test-de-securite")
  >()),
  useTestDeSecurite: () => ({
    ready: captchaStub.ready,
    headers: undefined,
    field: null,
    reset: captchaStub.reset,
  }),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/")
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

describe("ForgotPasswordForm", () => {
  it("renders the initial email input form with return to login link", () => {
    render(<ForgotPasswordForm />)

    expect(container.textContent).toContain("Mot de passe oublié")
    expect(container.textContent).toContain("Entrez votre adresse e-mail")

    const emailInput = container.querySelector<HTMLInputElement>(
      "input[type='email']"
    )
    expect(emailInput).not.toBeNull()

    const submitBtn = container.querySelector<HTMLButtonElement>(
      "button[type='submit']"
    )
    expect(submitBtn?.textContent).toContain("Envoyer le code")

    const loginLink = container.querySelector<HTMLAnchorElement>(
      `a[href='${loginUrl()}']`
    )
    expect(loginLink).not.toBeNull()
  })

  it("refuse un mot de passe de 14 caractères avec le message de la règle, pas le navigateur", async () => {
    render(<ForgotPasswordForm />)

    setInputValue(
      container.querySelector<HTMLInputElement>("input[type='email']")!,
      "jane@example.com"
    )
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("button[type='submit']")!
        .click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    setInputValue(container.querySelector<HTMLInputElement>("#otp")!, "123456")
    setInputValue(
      container.querySelector<HTMLInputElement>("#new-password")!,
      "MotDePasse!123"
    )
    setInputValue(
      container.querySelector<HTMLInputElement>("#confirm-password")!,
      "MotDePasse!123"
    )
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("button[type='submit']")!
        .click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain(
      "Le mot de passe doit contenir au moins 15 caractères."
    )
  })

  it("annonce le minimum de 15 caractères sur l'étape de réinitialisation", async () => {
    render(<ForgotPasswordForm />)

    setInputValue(
      container.querySelector<HTMLInputElement>("input[type='email']")!,
      "jane@example.com"
    )
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("button[type='submit']")!
        .click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain("Au moins 15 caractères.")
  })
})
