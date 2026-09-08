// @vitest-environment happy-dom
import {
  mockNextLink,
  mockNextNavigation,
  resetNavigation,
} from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ForgotPasswordForm } from "./forgot-password-form"
import { loginUrl } from "@/lib/lien-de-connexion"

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

vi.mock("@/components/auth/turnstile", () => ({
  Turnstile: () => null,
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
})
