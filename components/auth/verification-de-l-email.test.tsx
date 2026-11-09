// @vitest-environment happy-dom
import { setInputValue } from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { creerPortAuthentificationEnMemoire } from "@/test/port-authentification"
import type { PortAuthentificationEnMemoire } from "@/test/port-authentification"
import type { ResultatAuthentification } from "./port-authentification"
import { useOtpExchange } from "./verification-de-l-email"

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
let port: PortAuthentificationEnMemoire
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  port = creerPortAuthentificationEnMemoire()
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
  port: portDuTest = port,
}: {
  email?: string
  type?: "email-verification" | "forget-password"
  onSent?: () => void
  onVerified?: (email: string) => void
  port?: PortAuthentificationEnMemoire
}) {
  const otp = useOtpExchange({ email, type, onSent, onVerified }, portDuTest)
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
  it("sends the code with the Test de sécurité jeton header and flags it as sent", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    const onSent = vi.fn()

    await render(<Harness onSent={onSent} />)
    await loadScript()
    await setToken("otp-token")

    expect(captchaReady()).toBe("true")
    await clickAndFlush(sendButton())

    expect(port.appels).toEqual([
      {
        operation: "envoyerCode",
        email: "jane@example.com",
        type: "email-verification",
        entetes: { "x-captcha-response": "otp-token" },
      },
    ])
    expect(otpSent()).toBe("true")
    expect(onSent).toHaveBeenCalled()
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("sends without a jeton header when the test de sécurité is not required", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    const onSent = vi.fn()

    await render(<Harness onSent={onSent} />)
    await clickAndFlush(sendButton())

    expect(port.appels).toEqual([
      {
        operation: "envoyerCode",
        email: "jane@example.com",
        type: "email-verification",
        entetes: undefined,
      },
    ])
    expect(otpSent()).toBe("true")
    expect(onSent).toHaveBeenCalled()
  })

  it("sends with the forget-password type when asked", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")

    await render(<Harness type="forget-password" />)
    await clickAndFlush(sendButton())

    expect(port.appels).toEqual([
      expect.objectContaining({ type: "forget-password" }),
    ])
  })

  it("keeps the code un-sent and surfaces the translated error when the send fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    port.repondre = () => ({
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
    port.repondre = () => ({
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

  it("does not reset the Test de sécurité when the send is refused for another reason", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    port.repondre = () => ({
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
    let resolveSend!: (value: ResultatAuthentification) => void
    port.repondre = () =>
      new Promise((resolve) => {
        resolveSend = resolve
      })

    await render(<Harness />)

    await act(async () => {
      sendButton().click()
      await Promise.resolve()
    })
    expect(container.querySelector("[data-loading]")).not.toBeNull()
    expect(otpSent()).toBe("false")

    await act(async () => {
      resolveSend({ error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector("[data-loading]")).toBeNull()
    expect(otpSent()).toBe("true")
  })

  it("verifies the code without any captcha header and calls onVerified with the email", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
    const onVerified = vi.fn()

    await render(<Harness onVerified={onVerified} />)
    await loadScript()
    await setToken("otp-token")
    setInputValue(otpInput(), "123456")

    await clickAndFlush(verifyButton())

    expect(port.appels).toEqual([
      {
        operation: "verifierCode",
        email: "jane@example.com",
        code: "123456",
      },
    ])
    expect(onVerified).toHaveBeenCalledWith("jane@example.com")
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("surfaces the translated verify error and does not call onVerified when the code is invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
    port.repondre = () => ({
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
    let resolveVerify!: (value: ResultatAuthentification) => void
    port.repondre = () =>
      new Promise((resolve) => {
        resolveVerify = resolve
      })
    const onVerified = vi.fn()

    await render(<Harness onVerified={onVerified} />)
    setInputValue(otpInput(), "123456")

    await act(async () => {
      verifyButton().click()
      await Promise.resolve()
    })
    expect(container.querySelector("[data-loading]")).not.toBeNull()

    await act(async () => {
      resolveVerify({ error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector("[data-loading]")).toBeNull()
    expect(onVerified).toHaveBeenCalledWith("jane@example.com")
  })
})
