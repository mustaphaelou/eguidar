// @vitest-environment happy-dom
import {
  mockNextNavigation,
  resetNavigation,
  setInputValue,
} from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import { useSignInFlow } from "./use-sign-in-flow"

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

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("@/lib/client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    emailOtp: {
      verifyEmail: vi.fn(),
    },
  },
}))

const mockedAuthClient = authClient as unknown as {
  signIn: {
    email: ReturnType<typeof vi.fn>
    social: ReturnType<typeof vi.fn>
  }
  emailOtp: {
    verifyEmail: ReturnType<typeof vi.fn>
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

function Harness({ onSuccess }: { onSuccess?: () => void }) {
  const flow = useSignInFlow({ onSuccess })
  return (
    <div>
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
      <input
        aria-label="otp"
        value={flow.otp.otp}
        onChange={(e) => flow.otp.setOtp(e.target.value)}
      />
      <button type="button" data-verify-otp onClick={() => flow.otp.verify()}>
        verify otp
      </button>
      <form onSubmit={flow.handleSignIn}>
        <button type="submit">sign in</button>
      </form>
      <button
        type="button"
        data-social-google
        onClick={() => flow.handleSocial("google")}
      >
        social google
      </button>
      <div data-step={flow.step} />
      {flow.notice && <p data-notice>{flow.notice}</p>}
      {flow.error && <p data-error>{flow.error}</p>}
      {flow.loading && <p data-loading>loading</p>}
    </div>
  )
}

function PrefillHarness() {
  const flow = useSignInFlow({ initialEmail: "prefilled@example.com" })
  return (
    <input
      aria-label="email"
      value={flow.email}
      onChange={(e) => flow.setEmail(e.target.value)}
    />
  )
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

function signInButton() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!
}

function socialButton() {
  return container.querySelector<HTMLButtonElement>("[data-social-google]")!
}

function step() {
  return container.querySelector("[data-step]")?.getAttribute("data-step")
}

function notice() {
  return container.querySelector("[data-notice]")?.textContent ?? null
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

describe("useSignInFlow", () => {
  it("navigates to a validated ?next= after successful sign-in", async () => {
    window.history.replaceState(null, "", "/?next=/profil")
    mockedAuthClient.signIn.email.mockResolvedValue({ data: {}, error: null })

    render(<Harness />)
    setInputValue(emailInput(), "test@example.com")
    setInputValue(passwordInput(), "secret123")

    await clickAndFlush(signInButton())

    expect(window.location.pathname).toBe("/profil")
    expect(mockedAuthClient.signIn.email).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "secret123",
      fetchOptions: { headers: undefined },
    })
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("calls onSuccess and stays on the page when there is no ?next=", async () => {
    window.history.replaceState(null, "", "/")
    mockedAuthClient.signIn.email.mockResolvedValue({ data: {}, error: null })
    const onSuccess = vi.fn()

    render(<Harness onSuccess={onSuccess} />)
    setInputValue(emailInput(), "test@example.com")
    setInputValue(passwordInput(), "secret123")

    await clickAndFlush(signInButton())

    expect(onSuccess).toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")
    expect(step()).toBe("form")
  })

  it("moves to the code-verification step when the e-mail is not verified", async () => {
    window.history.replaceState(null, "", "/?next=/profil")
    mockedAuthClient.signIn.email.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", message: "not verified" },
    })
    const onSuccess = vi.fn()

    render(<Harness onSuccess={onSuccess} />)
    setInputValue(emailInput(), "test@example.com")
    setInputValue(passwordInput(), "secret123")

    await clickAndFlush(signInButton())

    expect(step()).toBe("otp")
    expect(onSuccess).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")
    expect(error()).toBeNull()
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("surfaces INVALID_EMAIL_OR_PASSWORD and stays on the form step", async () => {
    mockedAuthClient.signIn.email.mockResolvedValue({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "bad credentials" },
    })

    render(<Harness />)
    setInputValue(emailInput(), "test@example.com")
    setInputValue(passwordInput(), "secret123")

    await clickAndFlush(signInButton())

    expect(error()).toBe("E-mail ou mot de passe invalide.")
    expect(step()).toBe("form")
    expect(container.querySelector("[data-loading]")).toBeNull()
  })

  it("resets the captcha so a rejected sign-in retries with a fresh token", async () => {
    mockedAuthClient.signIn.email.mockResolvedValue({
      data: null,
      error: { code: "INVALID_RESPONSE", message: "captcha rejected" },
    })

    render(<Harness />)
    setInputValue(emailInput(), "test@example.com")
    setInputValue(passwordInput(), "secret123")

    await clickAndFlush(signInButton())

    expect(captchaStub.reset).toHaveBeenCalled()
    expect(error()).toBe("Le test de sécurité a échoué. Veuillez réessayer.")
    expect(step()).toBe("form")
  })

  it("walks the tail from the unverified e-mail to the code step, the verified notice, and a successful sign-in", async () => {
    window.history.replaceState(null, "", "/?next=/profil")
    mockedAuthClient.signIn.email
      .mockResolvedValueOnce({
        data: null,
        error: { code: "EMAIL_NOT_VERIFIED", message: "not verified" },
      })
      .mockResolvedValueOnce({ data: {}, error: null })
    mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
      data: {},
      error: null,
    })
    const onSuccess = vi.fn()

    render(<Harness onSuccess={onSuccess} />)
    setInputValue(emailInput(), "test@example.com")
    setInputValue(passwordInput(), "secret123")

    await clickAndFlush(signInButton())

    expect(step()).toBe("otp")
    expect(onSuccess).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")

    setInputValue(otpInput(), "123456")
    await clickAndFlush(container.querySelector("[data-verify-otp]")!)

    expect(step()).toBe("form")
    expect(notice()).toContain("Votre e-mail est vérifié")

    await clickAndFlush(signInButton())

    expect(mockedAuthClient.emailOtp.verifyEmail).toHaveBeenCalledWith({
      email: "test@example.com",
      otp: "123456",
    })
    expect(window.location.pathname).toBe("/profil")
  })

  it("initializes the email from initialEmail", () => {
    render(
      <div>
        <PrefillHarness />
      </div>
    )

    expect(emailInput().value).toBe("prefilled@example.com")
  })

  it("uses the current URL without ?open= as the social callbackURL", async () => {
    window.history.replaceState(null, "", "/panier?open=login")
    mockedAuthClient.signIn.social.mockResolvedValue({ data: {}, error: null })

    render(<Harness />)

    await clickAndFlush(socialButton())

    expect(mockedAuthClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "http://localhost:3000/panier",
    })
  })

  it("keeps other search params in the social callbackURL", async () => {
    window.history.replaceState(null, "", "/?open=login&query=phone")
    mockedAuthClient.signIn.social.mockResolvedValue({ data: {}, error: null })

    render(<Harness />)

    await clickAndFlush(socialButton())

    expect(mockedAuthClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "http://localhost:3000/?query=phone",
    })
  })

  it("uses the current URL unchanged as the social callbackURL when there is no ?open=", async () => {
    window.history.replaceState(null, "", "/produits?query=phone")
    mockedAuthClient.signIn.social.mockResolvedValue({ data: {}, error: null })

    render(<Harness />)

    await clickAndFlush(socialButton())

    expect(mockedAuthClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "http://localhost:3000/produits?query=phone",
    })
  })
})
