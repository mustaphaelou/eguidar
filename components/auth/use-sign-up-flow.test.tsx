// @vitest-environment happy-dom
import { resetNavigation, setInputValue, useControlledFlow } from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthFlowStep } from "@/components/auth/auth-dialog"
import { authClient } from "@/lib/client"
import { useSignUpFlow } from "./use-sign-up-flow"

const captchaStub = vi.hoisted(() => ({
  ready: true,
  jeton: "jeton-inscription",
  reset: vi.fn(),
}))

vi.mock("@/components/auth/test-de-securite", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/auth/test-de-securite")
  >()),
  useTestDeSecurite: () => ({
    ready: captchaStub.ready,
    headers: { "x-captcha-response": captchaStub.jeton },
    field: null,
    reset: captchaStub.reset,
  }),
}))

vi.mock("@/lib/client", () => ({
  authClient: {
    signUp: {
      email: vi.fn(),
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

function Harness({
  step: stepProp = "form",
  email: emailProp = "",
  onStepChange,
  onVerified,
}: {
  step?: AuthFlowStep
  email?: string
  onStepChange?: (step: AuthFlowStep, email: string) => void
  onVerified?: (email: string) => void
}) {
  const controlled = useControlledFlow({
    step: stepProp,
    email: emailProp,
    onStepChange,
  })
  const flow = useSignUpFlow({ ...controlled, onVerified })
  return (
    <div>
      <input
        aria-label="name"
        value={flow.name}
        onChange={(e) => flow.setName(e.target.value)}
      />
      <input
        aria-label="email"
        value={flow.email}
        onChange={(e) => flow.setEmail(e.target.value)}
      />
      <input
        aria-label="password"
        value={flow.password}
        onChange={(e) => flow.setPassword(e.target.value)}
      />
      <form onSubmit={flow.handleSignUp}>
        <button type="submit">sign up</button>
      </form>
      <div data-step={flow.step} />
      {flow.error && <p data-error>{flow.error}</p>}
      {flow.loading && <p data-loading>loading</p>}
    </div>
  )
}

function nameInput() {
  return container.querySelector<HTMLInputElement>('input[aria-label="name"]')!
}

function emailInput() {
  return container.querySelector<HTMLInputElement>('input[aria-label="email"]')!
}

function passwordInput() {
  return container.querySelector<HTMLInputElement>(
    'input[aria-label="password"]'
  )!
}

function signUpButton() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!
}

function step() {
  return container.querySelector("[data-step]")?.getAttribute("data-step")
}

function error() {
  return container.querySelector("[data-error]")?.textContent ?? null
}

async function clickAndFlush(target: HTMLElement) {
  await act(async () => {
    target.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("useSignUpFlow", () => {
  it("submits a valid sign-up and moves to the otp step", async () => {
    mockedAuthClient.signUp.email.mockResolvedValue({ data: {}, error: null })
    const onStepChange = vi.fn()

    render(<Harness onStepChange={onStepChange} />)
    setInputValue(nameInput(), "Jane Doe")
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(passwordInput(), "password123")

    await clickAndFlush(signUpButton())

    expect(mockedAuthClient.signUp.email).toHaveBeenCalledWith({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "password123",
      fetchOptions: { headers: { "x-captcha-response": captchaStub.jeton } },
    })
    expect(onStepChange).toHaveBeenCalledWith("otp", "jane@example.com")
    expect(step()).toBe("otp")
    expect(container.querySelector("[data-loading]")).toBeNull()
    expect(error()).toBeNull()
  })

  it("surfaces USER_ALREADY_EXISTS and stays on the form step", async () => {
    mockedAuthClient.signUp.email.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS", message: "already exists" },
    })
    const onStepChange = vi.fn()

    render(<Harness onStepChange={onStepChange} />)
    setInputValue(nameInput(), "Jane Doe")
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(passwordInput(), "password123")

    await clickAndFlush(signUpButton())

    expect(error()).toBe("Un compte existe déjà avec cette adresse e-mail.")
    expect(step()).toBe("form")
    expect(onStepChange).not.toHaveBeenCalledWith("otp", expect.any(String))
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("shows loading while the sign-up is in flight and clears it after", async () => {
    let resolveSignUp!: (value: unknown) => void
    mockedAuthClient.signUp.email.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignUp = resolve
        })
    )
    const onStepChange = vi.fn()

    render(<Harness onStepChange={onStepChange} />)
    setInputValue(nameInput(), "Jane Doe")
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(passwordInput(), "password123")

    await act(async () => {
      signUpButton().click()
      await Promise.resolve()
    })
    expect(container.querySelector("[data-loading]")).not.toBeNull()
    expect(step()).toBe("form")

    await act(async () => {
      resolveSignUp({ data: {}, error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector("[data-loading]")).toBeNull()
    expect(onStepChange).toHaveBeenCalledWith("otp", "jane@example.com")
    expect(step()).toBe("otp")
  })

  it("resets the captcha so a rejected sign-up retries with a fresh token", async () => {
    mockedAuthClient.signUp.email.mockResolvedValue({
      data: null,
      error: { code: "VERIFICATION_FAILED", message: "captcha rejected" },
    })

    render(<Harness />)
    setInputValue(nameInput(), "Jane Doe")
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(passwordInput(), "password123")

    await clickAndFlush(signUpButton())

    expect(captchaStub.reset).toHaveBeenCalled()
    expect(error()).toBe("Le test de sécurité a échoué. Veuillez réessayer.")
    expect(step()).toBe("form")
  })

  it("does not reset the captcha when the sign-up is rejected for a non-captcha reason", async () => {
    mockedAuthClient.signUp.email.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS", message: "already exists" },
    })

    render(<Harness />)
    setInputValue(nameInput(), "Jane Doe")
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(passwordInput(), "password123")

    await clickAndFlush(signUpButton())

    expect(captchaStub.reset).not.toHaveBeenCalled()
  })

  it("renders the controlled email prop", () => {
    render(<Harness email="prefilled@example.com" />)

    expect(emailInput().value).toBe("prefilled@example.com")
  })
})
