// @vitest-environment happy-dom
import { setInputValue } from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import { useOtpExchange } from "./verification-de-l-email"

vi.mock("@/lib/client", () => ({
  authClient: {
    emailOtp: {
      sendVerificationOtp: vi.fn(),
      verifyEmail: vi.fn(),
    },
  },
}))

const mockedAuthClient = authClient as unknown as {
  emailOtp: {
    sendVerificationOtp: ReturnType<typeof vi.fn>
    verifyEmail: ReturnType<typeof vi.fn>
  }
}

type TurnstileOptions = {
  sitekey: string
  callback: (token: string) => void
  "expired-callback"?: () => void
  "error-callback"?: () => void
  theme?: string
}

const renderMock = vi.fn(
  (_container: HTMLElement, _options: TurnstileOptions) => "widget-1"
)
const removeMock = vi.fn()
const resetMock = vi.fn()

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.turnstile = {
    render: renderMock,
    remove: removeMock,
    reset: resetMock,
  }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  document.getElementById("turnstile-script")?.remove()
  delete window.turnstile
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  return act(async () => {
    root.render(element)
  })
}

function Harness({
  email = "jane@example.com",
  type = "email-verification",
  onSent,
  onVerified,
}: {
  email?: string
  type?: "email-verification" | "forget-password"
  onSent?: () => void
  onVerified?: (email: string) => void
}) {
  const otp = useOtpExchange({ email, type, onSent, onVerified })
  return (
    <div>
      <input
        aria-label="otp"
        value={otp.otp}
        onChange={(e) => otp.setOtp(e.target.value)}
      />
      <button type="button" data-send onClick={() => otp.send()}>
        send
      </button>
      <button type="button" data-verify onClick={() => otp.verify()}>
        verify
      </button>
      <div data-otp-sent={String(otp.otpSent)} />
      <div data-captcha-ready={String(otp.captchaReady)} />
      {otp.error && <p data-error>{otp.error}</p>}
      {otp.loading && <p data-loading>loading</p>}
      {otp.captchaField}
    </div>
  )
}

function otpInput() {
  return container.querySelector<HTMLInputElement>('input[aria-label="otp"]')!
}

function sendButton() {
  return container.querySelector<HTMLButtonElement>("[data-send]")!
}

function verifyButton() {
  return container.querySelector<HTMLButtonElement>("[data-verify]")!
}

function otpSent() {
  return container
    .querySelector("[data-otp-sent]")
    ?.getAttribute("data-otp-sent")
}

function captchaReady() {
  return container
    .querySelector("[data-captcha-ready]")
    ?.getAttribute("data-captcha-ready")
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

function capturedOptions(): TurnstileOptions {
  return renderMock.mock.calls[0][1]
}

async function loadScript() {
  const script = document.getElementById("turnstile-script")
  expect(script).not.toBeNull()
  await act(async () => {
    script!.dispatchEvent(new Event("load"))
  })
}

async function setToken(token: string) {
  await act(async () => {
    capturedOptions().callback(token)
  })
}

describe("useOtpExchange", () => {
  it("sends the code with the captcha jeton header and flags it as sent", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })
    const onSent = vi.fn()

    await render(<Harness onSent={onSent} />)
    await loadScript()
    await setToken("otp-token")

    expect(captchaReady()).toBe("true")
    await clickAndFlush(sendButton())

    expect(mockedAuthClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "jane@example.com",
      type: "email-verification",
      fetchOptions: {
        headers: { "x-captcha-response": "otp-token" },
      },
    })
    expect(otpSent()).toBe("true")
    expect(onSent).toHaveBeenCalled()
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("sends without a jeton header when the test de sécurité is not required", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })
    const onSent = vi.fn()

    await render(<Harness onSent={onSent} />)
    await clickAndFlush(sendButton())

    expect(mockedAuthClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "jane@example.com",
      type: "email-verification",
      fetchOptions: { headers: undefined },
    })
    expect(otpSent()).toBe("true")
    expect(onSent).toHaveBeenCalled()
  })

  it("sends with the forget-password type when asked", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: {},
      error: null,
    })

    await render(<Harness type="forget-password" />)
    await clickAndFlush(sendButton())

    expect(mockedAuthClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(
      expect.objectContaining({ type: "forget-password" })
    )
  })

  it("keeps the code un-sent and surfaces the translated error when the send fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: null,
      error: { code: "TOO_MANY_ATTEMPTS", message: "slow down" },
    })
    const onSent = vi.fn()

    await render(<Harness onSent={onSent} />)
    await clickAndFlush(sendButton())

    expect(otpSent()).toBe("false")
    expect(onSent).not.toHaveBeenCalled()
    expect(error()).toBe(
      "Trop de tentatives. Veuillez patienter avant de réessayer."
    )
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("resets the Test de sécurité after a rejected send so the retry carries a fresh jeton", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: null,
      error: { code: "VERIFICATION_FAILED", message: "captcha rejected" },
    })

    await render(<Harness />)
    await loadScript()
    await setToken("otp-token")
    await clickAndFlush(sendButton())

    expect(resetMock).toHaveBeenCalledWith("widget-1")
    expect(captchaReady()).toBe("false")
    expect(otpSent()).toBe("false")
    expect(error()).toBe("Le test de sécurité a échoué. Veuillez réessayer.")
  })

  it("does not reset the Test de sécurité when the send is rejected for a non-captcha reason", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
      data: null,
      error: { code: "TOO_MANY_ATTEMPTS", message: "slow down" },
    })

    await render(<Harness />)
    await loadScript()
    await setToken("otp-token")
    await clickAndFlush(sendButton())

    expect(resetMock).not.toHaveBeenCalled()
  })

  it("shows loading while the send is in flight and clears it after", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    let resolveSend!: (value: unknown) => void
    mockedAuthClient.emailOtp.sendVerificationOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve
        })
    )

    await render(<Harness />)

    await act(async () => {
      sendButton().click()
      await Promise.resolve()
    })
    expect(container.querySelector("[data-loading]")).not.toBeNull()
    expect(otpSent()).toBe("false")

    await act(async () => {
      resolveSend({ data: {}, error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector("[data-loading]")).toBeNull()
    expect(otpSent()).toBe("true")
  })

  it("verifies the code without any captcha header and calls onVerified with the email", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
      data: {},
      error: null,
    })
    const onVerified = vi.fn()

    await render(<Harness onVerified={onVerified} />)
    await loadScript()
    await setToken("otp-token")
    setInputValue(otpInput(), "123456")

    await clickAndFlush(verifyButton())

    expect(mockedAuthClient.emailOtp.verifyEmail).toHaveBeenCalledWith({
      email: "jane@example.com",
      otp: "123456",
    })
    expect(
      mockedAuthClient.emailOtp.verifyEmail.mock.calls[0][0]
    ).not.toHaveProperty("fetchOptions")
    expect(onVerified).toHaveBeenCalledWith("jane@example.com")
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("surfaces the translated verify error and does not call onVerified when the code is invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
      data: null,
      error: { code: "INVALID_OTP", message: "bad code" },
    })
    const onVerified = vi.fn()

    await render(<Harness onVerified={onVerified} />)
    setInputValue(otpInput(), "123456")

    await clickAndFlush(verifyButton())

    expect(error()).toBe("Le code de vérification est invalide ou incorrect.")
    expect(onVerified).not.toHaveBeenCalled()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("shows loading while the verification is in flight and clears it after", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    let resolveVerify!: (value: unknown) => void
    mockedAuthClient.emailOtp.verifyEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerify = resolve
        })
    )
    const onVerified = vi.fn()

    await render(<Harness onVerified={onVerified} />)
    setInputValue(otpInput(), "123456")

    await act(async () => {
      verifyButton().click()
      await Promise.resolve()
    })
    expect(container.querySelector("[data-loading]")).not.toBeNull()

    await act(async () => {
      resolveVerify({ data: {}, error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector("[data-loading]")).toBeNull()
    expect(onVerified).toHaveBeenCalledWith("jane@example.com")
  })
})
