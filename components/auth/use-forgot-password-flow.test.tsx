// @vitest-environment happy-dom
import { resetNavigation, setInputValue } from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import { useForgotPasswordFlow } from "./use-forgot-password-flow"

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
    emailOtp: {
      sendVerificationOtp: vi.fn(),
      resetPassword: vi.fn(),
    },
  },
}))

const mockedAuthClient = authClient as unknown as {
  emailOtp: {
    sendVerificationOtp: ReturnType<typeof vi.fn>
    resetPassword: ReturnType<typeof vi.fn>
  }
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

function Harness() {
  const flow = useForgotPasswordFlow()
  return (
    <div>
      <input
        aria-label="email"
        value={flow.email}
        onChange={(e) => flow.setEmail(e.target.value)}
      />
      <input
        aria-label="otp"
        value={flow.otp.otp}
        onChange={(e) => flow.otp.setOtp(e.target.value)}
      />
      <input
        aria-label="password"
        value={flow.password}
        onChange={(e) => flow.setPassword(e.target.value)}
      />
      <input
        aria-label="confirm-password"
        value={flow.confirmPassword}
        onChange={(e) => flow.setConfirmPassword(e.target.value)}
      />
      <button type="button" data-send onClick={() => flow.otp.send()}>
        send
      </button>
      <form onSubmit={flow.handleResetPassword}>
        <button type="submit">reset</button>
      </form>
      <button type="button" data-back onClick={flow.backToEmail}>
        back
      </button>
      <div data-step={flow.step} />
      {flow.error && <p data-error>{flow.error}</p>}
      {flow.otp.error && <p data-otp-error>{flow.otp.error}</p>}
      {flow.loading && <p data-loading>loading</p>}
    </div>
  )
}

function emailInput() {
  return container.querySelector<HTMLInputElement>('input[aria-label="email"]')!
}

function otpInput() {
  return container.querySelector<HTMLInputElement>('input[aria-label="otp"]')!
}

function passwordInput() {
  return container.querySelector<HTMLInputElement>(
    'input[aria-label="password"]'
  )!
}

function confirmPasswordInput() {
  return container.querySelector<HTMLInputElement>(
    'input[aria-label="confirm-password"]'
  )!
}

function sendButton() {
  return container.querySelector<HTMLButtonElement>("[data-send]")!
}

function resetButton() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!
}

function backButton() {
  return container.querySelector<HTMLButtonElement>("[data-back]")!
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

async function sendCode() {
  setInputValue(emailInput(), "jane@example.com")
  await clickAndFlush(sendButton())
}

describe("useForgotPasswordFlow", () => {
  it("sends the code and moves to the otp step", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })

    render(<Harness />)
    await sendCode()

    expect(mockedAuthClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "jane@example.com",
      type: "forget-password",
      fetchOptions: { headers: undefined },
    })
    expect(step()).toBe("otp")
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("resets the password and moves to the success step", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })
    mockedAuthClient.emailOtp.resetPassword.mockResolvedValue({
      data: {},
      error: null,
    })

    render(<Harness />)
    await sendCode()
    setInputValue(otpInput(), "123456")
    setInputValue(passwordInput(), "MotDePasse!12345")
    setInputValue(confirmPasswordInput(), "MotDePasse!12345")

    await clickAndFlush(resetButton())

    expect(mockedAuthClient.emailOtp.resetPassword).toHaveBeenCalledWith({
      email: "jane@example.com",
      otp: "123456",
      password: "MotDePasse!12345",
    })
    expect(
      mockedAuthClient.emailOtp.resetPassword.mock.calls[0][0]
    ).not.toHaveProperty("fetchOptions")
    expect(step()).toBe("success")
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("rejects a too-short password without calling resetPassword", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })

    render(<Harness />)
    await sendCode()
    setInputValue(otpInput(), "123456")
    setInputValue(passwordInput(), "MotDePasse!123")
    setInputValue(confirmPasswordInput(), "MotDePasse!123")

    await clickAndFlush(resetButton())

    expect(mockedAuthClient.emailOtp.resetPassword).not.toHaveBeenCalled()
    expect(error()).toBe(
      "Le mot de passe doit contenir au moins 15 caractères."
    )
    expect(step()).toBe("otp")
  })

  it("rejects mismatched passwords without calling resetPassword", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })

    render(<Harness />)
    await sendCode()
    setInputValue(otpInput(), "123456")
    setInputValue(passwordInput(), "MotDePasse!12345")
    setInputValue(confirmPasswordInput(), "MotDePasse!67890")

    await clickAndFlush(resetButton())

    expect(mockedAuthClient.emailOtp.resetPassword).not.toHaveBeenCalled()
    expect(error()).toBe("Les mots de passe ne correspondent pas.")
    expect(step()).toBe("otp")
  })

  it("surfaces the translated reset error and stays on the otp step", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })
    mockedAuthClient.emailOtp.resetPassword.mockResolvedValue({
      data: null,
      error: { code: "INVALID_OTP", message: "bad code" },
    })

    render(<Harness />)
    await sendCode()
    setInputValue(otpInput(), "123456")
    setInputValue(passwordInput(), "MotDePasse!12345")
    setInputValue(confirmPasswordInput(), "MotDePasse!12345")

    await clickAndFlush(resetButton())

    expect(error()).toBe("Le code de vérification est invalide ou incorrect.")
    expect(step()).toBe("otp")
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("returns to the email step after a failed reset and clears the error", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })
    mockedAuthClient.emailOtp.resetPassword.mockResolvedValue({
      data: null,
      error: { code: "INVALID_OTP", message: "bad code" },
    })

    render(<Harness />)
    await sendCode()
    setInputValue(otpInput(), "123456")
    setInputValue(passwordInput(), "MotDePasse!12345")
    setInputValue(confirmPasswordInput(), "MotDePasse!12345")

    await clickAndFlush(resetButton())
    expect(error()).not.toBeNull()

    await clickAndFlush(backButton())

    expect(step()).toBe("email")
    expect(error()).toBeNull()
  })
})
