// @vitest-environment happy-dom
import {
  mockNextLink,
  mockNextNavigation,
  resetNavigation,
  setInputValue,
} from "./test-utils"
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import type { AuthFlow, AuthFlowStep } from "./auth-dialog"
import { SignUpForm } from "./sign-up-form"

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

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

vi.mock("@/lib/client", () => ({
  authClient: {
    signUp: {
      email: vi.fn(),
    },
    emailOtp: {
      verifyEmail: vi.fn(),
      sendVerificationOtp: vi.fn(),
    },
  },
}))

const mockedAuthClient = authClient as unknown as {
  signUp: { email: ReturnType<typeof vi.fn> }
}

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/")
  captchaStub.ready = true
  captchaStub.reset.mockClear()
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

function input(id: string) {
  return container.querySelector<HTMLInputElement>(`#${id}`)!
}

function submitButton() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!
}

async function clickAndFlush(target: HTMLElement) {
  await act(async () => {
    target.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function Harness() {
  const [step, setStep] = useState<AuthFlowStep>("form")
  const [email, setEmail] = useState("")
  const flow: AuthFlow = {
    step,
    email,
    onStepChange: (nextStep, nextEmail) => {
      setStep(nextStep)
      setEmail(nextEmail)
    },
  }
  return <SignUpForm flow={flow} />
}

describe("SignUpForm", () => {
  it("reports field issues and does not submit an invalid payload", async () => {
    render(<Harness />)

    await clickAndFlush(submitButton())

    expect(mockedAuthClient.signUp.email).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Saisissez votre nom complet.")
    expect(container.textContent).toContain("Saisissez votre adresse e-mail.")
    expect(container.textContent).toContain(
      "Le mot de passe doit contenir au moins 8 caractères."
    )
  })

  it("submits a valid payload through the flow and clears the field issues", async () => {
    mockedAuthClient.signUp.email.mockResolvedValue({ data: {}, error: null })

    render(<Harness />)
    setInputValue(input("name"), "Jane Doe")
    setInputValue(input("email"), "jane@example.com")
    setInputValue(input("password"), "password123")

    await clickAndFlush(submitButton())

    expect(mockedAuthClient.signUp.email).toHaveBeenCalledWith({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "password123",
      fetchOptions: { headers: undefined },
    })
    expect(container.textContent).not.toContain("Saisissez votre nom complet.")
  })

  it("keeps the submit button disabled while the captcha is not ready", async () => {
    captchaStub.ready = false

    render(<Harness />)
    setInputValue(input("name"), "Jane Doe")
    setInputValue(input("email"), "jane@example.com")
    setInputValue(input("password"), "password123")

    expect(submitButton().disabled).toBe(true)
    expect(mockedAuthClient.signUp.email).not.toHaveBeenCalled()
  })
})
