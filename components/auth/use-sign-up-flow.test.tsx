// @vitest-environment happy-dom
import { resetNavigation, setInputValue } from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import { useSignUpFlow } from "./use-sign-up-flow"

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
  emailOtp: {
    verifyEmail: ReturnType<typeof vi.fn>
    sendVerificationOtp: ReturnType<typeof vi.fn>
  }
}

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
  vi.clearAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function Harness({
  initialEmail,
  onVerified,
  onIssues,
}: {
  initialEmail?: string
  onVerified?: (email: string) => void
  onIssues?: (issues: Record<string, string>) => void
}) {
  const flow = useSignUpFlow({ initialEmail, onVerified, onIssues })
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
      <input
        aria-label="otp"
        value={flow.otp}
        onChange={(e) => flow.setOtp(e.target.value)}
      />
      <button
        type="button"
        data-set-otp-captcha
        onClick={() => flow.otpCaptcha.onChange("otp-token")}
      >
        set otp captcha token
      </button>
      <button type="button" data-send-otp onClick={() => flow.handleSendOtp()}>
        send otp
      </button>
      <button
        type="button"
        data-verify-otp
        onClick={() =>
          flow.handleVerifyOtp({ preventDefault() {} } as React.FormEvent)
        }
      >
        verify otp
      </button>
      <div data-step={flow.step} />
      <div data-otp-sent={String(flow.otpSent)} />
      {flow.error && <p data-error>{flow.error}</p>}
      {flow.loading && <p data-loading>loading</p>}
    </div>
  )
}

function PrefillHarness() {
  const flow = useSignUpFlow({ initialEmail: "prefilled@example.com" })
  return (
    <input
      aria-label="email"
      value={flow.email}
      onChange={(e) => flow.setEmail(e.target.value)}
    />
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

function otpInput() {
  return container.querySelector<HTMLInputElement>('input[aria-label="otp"]')!
}

function signUpButton() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!
}

function otpCaptchaButton() {
  return container.querySelector<HTMLButtonElement>("[data-set-otp-captcha]")!
}

function sendOtpButton() {
  return container.querySelector<HTMLButtonElement>("[data-send-otp]")!
}

function verifyOtpButton() {
  return container.querySelector<HTMLButtonElement>("[data-verify-otp]")!
}

function step() {
  return container.querySelector("[data-step]")?.getAttribute("data-step")
}

function otpSent() {
  return container
    .querySelector("[data-otp-sent]")
    ?.getAttribute("data-otp-sent")
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

    render(<Harness />)
    setInputValue(nameInput(), "Jane Doe")
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(passwordInput(), "password123")

    await clickAndFlush(signUpButton())

    expect(mockedAuthClient.signUp.email).toHaveBeenCalledWith({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "password123",
      fetchOptions: { headers: undefined },
    })
    expect(step()).toBe("otp")
    expect(container.querySelector("[data-loading]")).toBeNull()
    expect(error()).toBeNull()
  })

  it("reports validation issues and does not submit an invalid payload", async () => {
    const onIssues = vi.fn()

    render(<Harness onIssues={onIssues} />)

    await clickAndFlush(signUpButton())

    expect(mockedAuthClient.signUp.email).not.toHaveBeenCalled()
    expect(step()).toBe("form")
    expect(onIssues).toHaveBeenCalledWith({
      name: "Saisissez votre nom complet.",
      email: "Saisissez votre adresse e-mail.",
      password: "Le mot de passe doit contenir au moins 8 caractères.",
    })
  })

  it("surfaces USER_ALREADY_EXISTS and stays on the form step", async () => {
    mockedAuthClient.signUp.email.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS", message: "already exists" },
    })

    render(<Harness />)
    setInputValue(nameInput(), "Jane Doe")
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(passwordInput(), "password123")

    await clickAndFlush(signUpButton())

    expect(error()).toBe("Un compte existe déjà avec cette adresse e-mail.")
    expect(step()).toBe("form")
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

    render(<Harness />)
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
    expect(step()).toBe("otp")
  })

  it("sends the verification OTP with the otp-step captcha token in the fetch headers", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })

    render(<Harness />)
    setInputValue(emailInput(), "jane@example.com")

    await act(async () => {
      otpCaptchaButton().click()
      await Promise.resolve()
    })
    await clickAndFlush(sendOtpButton())

    expect(mockedAuthClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "jane@example.com",
      type: "email-verification",
      fetchOptions: { headers: { "x-captcha-response": "otp-token" } },
    })
    expect(otpSent()).toBe("true")
    expect(error()).toBeNull()
  })

  it("keeps the otp step un-sent and surfaces the translated error when the OTP send fails", async () => {
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: null,
      error: { code: "TOO_MANY_ATTEMPTS", message: "slow down" },
    })

    render(<Harness />)
    setInputValue(emailInput(), "jane@example.com")

    await clickAndFlush(sendOtpButton())

    expect(otpSent()).toBe("false")
    expect(error()).toBe(
      "Trop de tentatives. Veuillez patienter avant de réessayer."
    )
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("verifies the OTP and calls onVerified with the email", async () => {
    mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
      data: {},
      error: null,
    })
    const onVerified = vi.fn()

    render(<Harness onVerified={onVerified} />)
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(otpInput(), "123456")

    await clickAndFlush(verifyOtpButton())

    expect(mockedAuthClient.emailOtp.verifyEmail).toHaveBeenCalledWith({
      email: "jane@example.com",
      otp: "123456",
    })
    expect(onVerified).toHaveBeenCalledWith("jane@example.com")
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("surfaces the translated verify error and does not call onVerified when the OTP is invalid", async () => {
    mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
      data: null,
      error: { code: "INVALID_OTP", message: "bad code" },
    })
    const onVerified = vi.fn()

    render(<Harness onVerified={onVerified} />)
    setInputValue(emailInput(), "jane@example.com")
    setInputValue(otpInput(), "123456")

    await clickAndFlush(verifyOtpButton())

    expect(error()).toBe("Le code de vérification est invalide ou incorrect.")
    expect(onVerified).not.toHaveBeenCalled()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("initializes the email from initialEmail", () => {
    render(
      <div>
        <PrefillHarness />
      </div>
    )

    expect(emailInput().value).toBe("prefilled@example.com")
  })
})
