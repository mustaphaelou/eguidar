// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import { useSignInFlow } from "./use-sign-in-flow"
import { setInputValue } from "./test-utils"

const { params } = vi.hoisted(() => ({
  params: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
}))

vi.mock("@/lib/client", () => ({
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

const mockedAuthClient = authClient as unknown as {
  signIn: {
    email: ReturnType<typeof vi.fn>
    social: ReturnType<typeof vi.fn>
  }
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
  window.history.replaceState(null, "", "/")
  params.delete("next")
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
      <button
        type="button"
        onClick={() =>
          flow.handleVerifyOtp({ preventDefault() {} } as React.FormEvent)
        }
      >
        verify otp
      </button>
      <div data-step={flow.step} />
      {flow.notice && <p data-notice>{flow.notice}</p>}
      <form onSubmit={flow.handleSignIn}>
        <button type="submit">sign in</button>
      </form>
    </div>
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

function signInButton() {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!
}

function setValue(input: HTMLInputElement, value: string) {
  setInputValue(input, value)
}

describe("useSignInFlow", () => {
  it("navigates to a validated ?next= after successful sign-in", async () => {
    params.set("next", "/profil")
    mockedAuthClient.signIn.email.mockResolvedValue({ data: {}, error: null })

    render(<Harness />)
    setValue(emailInput(), "test@example.com")
    setValue(passwordInput(), "secret123")

    await act(async () => {
      signInButton().click()
      await Promise.resolve()
    })

    expect(window.location.pathname).toBe("/profil")
    expect(mockedAuthClient.signIn.email).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "secret123",
      fetchOptions: { headers: undefined },
    })
  })

  it("calls onSuccess and stays on the page when there is no ?next=", async () => {
    params.delete("next")
    mockedAuthClient.signIn.email.mockResolvedValue({ data: {}, error: null })
    const onSuccess = vi.fn()

    render(<Harness onSuccess={onSuccess} />)
    setValue(emailInput(), "test@example.com")
    setValue(passwordInput(), "secret123")

    await act(async () => {
      signInButton().click()
      await Promise.resolve()
    })

    expect(onSuccess).toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")
  })

  it("returns to the form step with a verified notice after OTP verification instead of navigating", async () => {
    params.set("next", "/profil")
    mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
      data: {},
      error: null,
    })
    const onSuccess = vi.fn()

    render(<Harness onSuccess={onSuccess} />)

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[type="button"]')!
        .click()
      await Promise.resolve()
    })

    expect(mockedAuthClient.emailOtp.verifyEmail).toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")
    expect(
      container.querySelector("[data-step]")?.getAttribute("data-step")
    ).toBe("form")
    expect(container.querySelector("[data-notice]")?.textContent).toContain(
      "Votre e-mail est vérifié"
    )
  })

  it("does not sign in after OTP verification when there is no ?next=", async () => {
    params.delete("next")
    mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
      data: {},
      error: null,
    })
    const onSuccess = vi.fn()

    render(<Harness onSuccess={onSuccess} />)

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[type="button"]')!
        .click()
      await Promise.resolve()
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")
    expect(container.querySelector("[data-notice]")?.textContent).toContain(
      "Votre e-mail est vérifié"
    )
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
