// @vitest-environment happy-dom
import {
  flush,
  mockNextLink,
  mockNextNavigation,
  resetNavigation,
  setInputValue,
} from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authClient } from "@/lib/client"
import { AuthDialogsProvider, useAuthDialogs } from "./auth-dialogs"
import { SignInDialog } from "./sign-in-dialog"
import { SignUpDialog } from "./sign-up-dialog"

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

vi.mock("@/components/auth/test-de-securite", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/auth/test-de-securite")
  >()),
  useTestDeSecurite: () => ({
    ready: true,
    headers: undefined,
    field: null,
    reset: vi.fn(),
  }),
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
  resetNavigation("/")
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

async function clickAndSync(target: HTMLElement) {
  act(() => {
    target.click()
  })
  await flush()
  act(() => {
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

async function renderSignUpDialog() {
  render(() => (
    <AuthDialogsProvider>
      <OpenSignUpButton />
      <SignInDialog hasGoogle={false} hasApple={false} />
      <SignUpDialog />
    </AuthDialogsProvider>
  ))
  await clickAndSync(container.querySelector("button")!)
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
  it("opens the sign-up dialog and swaps to login", async () => {
    await renderSignUpDialog()

    expect(dialog()).not.toBeNull()
    expect(title()).toBe("Créer un compte")

    await clickAndSync(
      document.querySelector<HTMLButtonElement>(
        "[data-slot='dialog-description'] button"
      )!
    )

    expect(title()).toBe("Connectez-vous pour continuer")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
  })

  it("swaps to the login dialog with the email prefilled after OTP verification", async () => {
    await renderSignUpDialog()

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
    await flush()
    act(() => {
      if (currentElement) roots[roots.length - 1].render(currentElement())
    })

    expect(title()).toBe("Connectez-vous pour continuer")
    expect(emailInput()?.value).toBe("jane@example.com")
    expect(new URL(window.location.href).searchParams.get("open")).toBe("login")
    expect(mockedAuthClient.emailOtp.verifyEmail).toHaveBeenCalledWith({
      email: "jane@example.com",
      otp: "123456",
    })
  })
})
