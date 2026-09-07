// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import { AuthDialogsProvider, useAuthDialogs } from "./auth-dialogs-context"
import { SignInDialog } from "./sign-in-dialog"
import { SignUpDialog } from "./sign-up-dialog"
import { setInputValue } from "./test-utils"

vi.mock("next/navigation", () => ({
  usePathname: () => new URL(window.location.href).pathname,
  useRouter: () => ({
    push: (url: string) => {
      window.history.pushState(null, "", url)
    },
    replace: (url: string) => {
      window.history.replaceState(null, "", url)
    },
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/auth/turnstile", () => ({
  Turnstile: () => null,
}))

vi.mock("@/lib/client", () => ({
  useSession: () => ({ data: null, isPending: false }),
  authClient: {
    signUp: {
      email: vi.fn(),
    },
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
  signUp: { email: ReturnType<typeof vi.fn> }
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
let currentElement: (() => ReactElement) | null = null

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.history.replaceState(null, "", "/")
  mockedAuthClient.signUp.email.mockResolvedValue({ data: {}, error: null })
  mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
    data: {},
    error: null,
  })
  mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
    data: {},
    error: null,
  })
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  currentElement = null
  container.remove()
  vi.restoreAllMocks()
})

function render(element: () => ReactElement) {
  currentElement = element
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element()))
}

function clickAndSync(target: HTMLElement) {
  act(() => {
    target.click()
    if (currentElement) roots[roots.length - 1].render(currentElement())
  })
}

function OpenSignUpButton() {
  const { openSignUp } = useAuthDialogs()
  return (
    <button type="button" onClick={() => openSignUp()}>
      open signup
    </button>
  )
}

function renderSignUpDialog() {
  render(() => (
    <AuthDialogsProvider>
      <OpenSignUpButton />
      <SignInDialog hasGoogle={false} hasApple={false} />
      <SignUpDialog />
    </AuthDialogsProvider>
  ))
  clickAndSync(container.querySelector("button")!)
}

function title() {
  return document.querySelector<HTMLElement>("[data-slot='dialog-title']")
    ?.textContent
}

function dialog() {
  return document.querySelector<HTMLElement>("[data-slot='dialog-content']")
}

function submitButton(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes(text)
  )
}

async function clickAndFlush(button: HTMLButtonElement) {
  await act(async () => {
    button.click()
    if (currentElement) roots[roots.length - 1].render(currentElement())
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function emailInput() {
  return document.querySelector<HTMLInputElement>(
    "[data-slot='dialog-content'] input[type='email']"
  )
}

describe("SignUpDialog", () => {
  it("opens the sign-up dialog and swaps to login", () => {
    renderSignUpDialog()

    expect(dialog()).not.toBeNull()
    expect(title()).toBe("Créer un compte")

    clickAndSync(
      document.querySelector<HTMLButtonElement>(
        "[data-slot='dialog-description'] button"
      )!
    )

    expect(title()).toBe("Connexion à Eguidar")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
  })

  it("swaps to the login dialog with the email prefilled after OTP verification", async () => {
    renderSignUpDialog()

    setInputValue(
      dialog()!.querySelector<HTMLInputElement>("#name")!,
      "Jane Doe"
    )
    setInputValue(emailInput()!, "jane@example.com")
    setInputValue(
      dialog()!.querySelector<HTMLInputElement>("#password")!,
      "password123"
    )
    await clickAndFlush(submitButton("Créer mon compte")!)

    expect(title()).toBe("Vérifiez votre e-mail")
    expect(dialog()?.textContent).toContain("jane@example.com")

    await clickAndFlush(submitButton("Envoyer le code")!)

    setInputValue(dialog()!.querySelector<HTMLInputElement>("#otp")!, "123456")
    await clickAndFlush(submitButton("Vérifier mon e-mail")!)

    expect(title()).toBe("Connexion à Eguidar")
    expect(emailInput()?.value).toBe("jane@example.com")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
    expect(mockedAuthClient.emailOtp.verifyEmail).toHaveBeenCalledWith({
      email: "jane@example.com",
      otp: "123456",
    })
  })
})
