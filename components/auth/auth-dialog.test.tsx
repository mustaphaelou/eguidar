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

import { AuthDialog } from "./auth-dialog"
import { AuthDialogsProvider, useAuthDialogs } from "./auth-dialogs"

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

type FlowSetter = (step: "form" | "otp", email: string) => void

const flowSetters = vi.hoisted(() => ({
  login: null as FlowSetter | null,
  signup: null as FlowSetter | null,
}))

vi.mock("@/components/auth/use-sign-in-flow", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/auth/use-sign-in-flow")>()
  return {
    ...actual,
    useSignInFlow: (options: Parameters<typeof actual.useSignInFlow>[0]) => {
      flowSetters.login = options.onStepChange
      return actual.useSignInFlow(options)
    },
  }
})

vi.mock("@/components/auth/use-sign-up-flow", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/auth/use-sign-up-flow")>()
  return {
    ...actual,
    useSignUpFlow: (options: Parameters<typeof actual.useSignUpFlow>[0]) => {
      flowSetters.signup = options.onStepChange
      return actual.useSignUpFlow(options)
    },
  }
})

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

function blockLinkNavigation(event: Event) {
  const anchor = (event.target as HTMLElement | null)?.closest("a")
  if (anchor) event.preventDefault()
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/")
  flowSetters.login = null
  flowSetters.signup = null
  mockedAuthClient.signUp.email.mockResolvedValue({ data: {}, error: null })
  mockedAuthClient.emailOtp.sendVerificationOtp.mockResolvedValue({
    data: {},
    error: null,
  })
  mockedAuthClient.emailOtp.verifyEmail.mockResolvedValue({
    data: {},
    error: null,
  })
  document.addEventListener("click", blockLinkNavigation, true)
})

afterEach(() => {
  document.removeEventListener("click", blockLinkNavigation, true)
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

function rerender() {
  act(() => {
    if (currentElement) roots[roots.length - 1].render(currentElement())
  })
}

async function clickAndSync(target: HTMLElement) {
  act(() => {
    target.click()
  })
  await flush()
  rerender()
}

async function clickAndFlush(button: HTMLButtonElement) {
  await act(async () => {
    button.click()
    if (currentElement) roots[roots.length - 1].render(currentElement())
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await flush()
  rerender()
}

function Harness({ children }: { children?: React.ReactNode }) {
  const { openLogin } = useAuthDialogs()
  return (
    <>
      <button type="button" onClick={() => openLogin()}>
        open login
      </button>
      {children}
    </>
  )
}

function SwapHarness() {
  const { openSignUp } = useAuthDialogs()
  return (
    <button type="button" data-open-signup onClick={() => openSignUp()}>
      open signup
    </button>
  )
}

function SeedHarness() {
  const { openLogin } = useAuthDialogs()
  return (
    <button
      type="button"
      data-open-login-seed
      onClick={() => openLogin({ email: "seed@example.com" })}
    >
      open login seeded
    </button>
  )
}

function renderDialogs({
  hasGoogle = false,
  hasFacebook = false,
  harness,
}: {
  hasGoogle?: boolean
  hasFacebook?: boolean
  harness?: React.ReactElement
} = {}) {
  render(() => (
    <AuthDialogsProvider>
      {harness}
      <AuthDialog
        dialog="login"
        hasGoogle={hasGoogle}
        hasFacebook={hasFacebook}
      />
      <AuthDialog
        dialog="signup"
        hasGoogle={hasGoogle}
        hasFacebook={hasFacebook}
      />
    </AuthDialogsProvider>
  ))
}

function dialog() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
}

function title() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-title"]')
    ?.textContent
}

function titleElement() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-title"]')
}

function description() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-description"]')
    ?.textContent
}

function emailInput() {
  return document.querySelector<HTMLInputElement>('input[type="email"]')
}

function swapButton() {
  return document.querySelector<HTMLButtonElement>(
    '[data-slot="dialog-description"] button'
  )
}

function openButton() {
  return container.querySelector<HTMLButtonElement>('button[type="button"]')!
}

function submitButton(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes(text)
  )
}

function socialProviderButtons() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.textContent?.includes("Continuer avec")
  )
}

describe("AuthDialog", () => {
  it("keeps the same title text size on both kinds", async () => {
    window.history.replaceState(null, "", "/?open=login")
    renderDialogs()
    await flush()
    rerender()
    expect(titleElement()?.className).toContain("text-lg")

    window.history.replaceState(null, "", "/?open=signup")
    rerender()
    expect(titleElement()?.className).toContain("text-lg")
  })

  describe("Connexion", () => {
    it("opens from the provider, writes ?open=login, and closes on Escape", async () => {
      renderDialogs({ harness: <Harness /> })

      expect(dialog()).toBeNull()
      await clickAndSync(openButton())

      expect(dialog()).not.toBeNull()
      expect(title()).toBe("Connectez-vous pour continuer")
      expect(emailInput()).not.toBeNull()
      expect(new URL(window.location.href).searchParams.get("open")).toBe(
        "login"
      )

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
        if (currentElement) roots[roots.length - 1].render(currentElement())
      })

      expect(dialog()).toBeNull()
      expect(new URL(window.location.href).searchParams.has("open")).toBe(false)
    })

    it("renders the popup with aria-modal", async () => {
      renderDialogs({ harness: <Harness /> })

      await clickAndSync(openButton())

      expect(
        document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")
      ).toBe("true")
    })

    it("shows the default title without a destination", async () => {
      window.history.replaceState(null, "", "/?open=login")
      renderDialogs()
      await flush()
      rerender()

      expect(title()).toBe("Connexion à Eguidar")
    })

    it("shows the commande title when the destination leads to an order", async () => {
      window.history.replaceState(
        null,
        "",
        "/?open=login&next=/produit/tableau-atlas"
      )
      renderDialogs({ harness: <Harness /> })

      await clickAndSync(openButton())

      expect(title()).toBe("Connectez-vous pour finaliser votre commande")
    })

    it("shows the continuer title for a non-commerce destination", async () => {
      window.history.replaceState(null, "", "/?open=login&next=/compte")
      renderDialogs({ harness: <Harness /> })

      await clickAndSync(openButton())

      expect(title()).toBe("Connectez-vous pour continuer")
    })

    it("does not treat prefixes as whole-path matches", async () => {
      window.history.replaceState(
        null,
        "",
        "/?open=login&next=/produits-voisins"
      )
      renderDialogs({ harness: <Harness /> })

      await clickAndSync(openButton())

      expect(title()).toBe("Connectez-vous pour continuer")
    })

    it("swaps to Inscription with the entered email prefilled", async () => {
      renderDialogs({ harness: <Harness /> })

      await clickAndSync(openButton())
      setInputValue(emailInput()!, "swap@example.com")
      await clickAndSync(swapButton()!)

      expect(title()).toBe("Créez votre compte pour continuer")
      expect(
        (dialog()?.querySelector('input[type="email"]') as HTMLInputElement)
          ?.value
      ).toBe("swap@example.com")
      expect(new URL(window.location.href).searchParams.get("open")).toBe(
        "signup"
      )
    })

    it("shows the otp title and description with the e-mail", async () => {
      mockedAuthClient.signIn.email.mockResolvedValue({
        data: null,
        error: { code: "EMAIL_NOT_VERIFIED" },
      })
      renderDialogs({ harness: <Harness /> })

      await clickAndSync(openButton())
      setInputValue(emailInput()!, "user@example.com")
      setInputValue(
        dialog()!.querySelector<HTMLInputElement>('input[type="password"]')!,
        "motdepasse"
      )
      await clickAndFlush(
        dialog()!.querySelector<HTMLButtonElement>(
          'form button[type="submit"]'
        )!
      )

      expect(title()).toBe("Vérifiez votre e-mail")
      expect(description()).toBe(
        "Saisissez le code de vérification envoyé à user@example.com."
      )
    })

    it("seeds the flow from the controller e-mail when opened with an e-mail seed", async () => {
      renderDialogs({ harness: <SeedHarness /> })

      await clickAndSync(
        container.querySelector<HTMLButtonElement>("[data-open-login-seed]")!
      )

      expect(emailInput()?.value).toBe("seed@example.com")
    })

    it("derives title, description, and swap from the flow step without form submission", async () => {
      window.history.replaceState(null, "", "/?open=login")
      renderDialogs()
      await flush()
      rerender()

      expect(flowSetters.login).not.toBeNull()
      expect(title()).toBe("Connexion à Eguidar")
      expect(swapButton()?.textContent).toBe("Inscrivez-vous")

      act(() => flowSetters.login!("otp", "direct@example.com"))
      expect(title()).toBe("Vérifiez votre e-mail")
      expect(description()).toBe(
        "Saisissez le code de vérification envoyé à direct@example.com."
      )
      expect(swapButton()).toBeNull()

      act(() => flowSetters.login!("form", "edited@example.com"))
      expect(title()).toBe("Connexion à Eguidar")
      expect(swapButton()?.textContent).toBe("Inscrivez-vous")

      await clickAndSync(swapButton()!)

      expect(title()).toBe("Créer un compte")
      expect(emailInput()?.value).toBe("edited@example.com")
      expect(new URL(window.location.href).searchParams.get("open")).toBe(
        "signup"
      )
    })

    it("closes on forgot-password", async () => {
      renderDialogs({ harness: <Harness /> })

      await clickAndSync(openButton())
      await clickAndSync(
        dialog()!.querySelector<HTMLAnchorElement>(
          'a[href="/mot-de-passe-oublie"]'
        )!
      )

      expect(dialog()).toBeNull()
      expect(new URL(window.location.href).searchParams.has("open")).toBe(false)
    })

    it("closes on success when there is no destination", async () => {
      mockedAuthClient.signIn.email.mockResolvedValue({ data: {}, error: null })
      window.history.replaceState(null, "", "/?open=login")
      renderDialogs()
      await flush()
      rerender()

      setInputValue(emailInput()!, "user@example.com")
      setInputValue(
        dialog()!.querySelector<HTMLInputElement>('input[type="password"]')!,
        "motdepasse"
      )
      await clickAndFlush(
        dialog()!.querySelector<HTMLButtonElement>(
          'form button[type="submit"]'
        )!
      )
      expect(dialog()).toBeNull()
      expect(new URL(window.location.href).searchParams.has("open")).toBe(false)
    })

    it("shows Continuer avec Google alone when Google is configured", async () => {
      window.history.replaceState(null, "", "/?open=login")
      renderDialogs({ hasGoogle: true })
      await flush()
      rerender()

      expect(
        socialProviderButtons().map((button) => button.textContent?.trim())
      ).toEqual(["Continuer avec Google"])
      expect(
        document.querySelector('[data-slot="field-separator"]')
      ).not.toBeNull()
    })

    it("shows Facebook first, then Google, when both providers are configured", async () => {
      window.history.replaceState(null, "", "/?open=login")
      renderDialogs({ hasGoogle: true, hasFacebook: true })
      await flush()
      rerender()

      expect(
        socialProviderButtons().map((button) => button.textContent?.trim())
      ).toEqual(["Continuer avec Facebook", "Continuer avec Google"])
      expect(
        document.querySelector('[data-slot="field-separator"]')
      ).not.toBeNull()
    })

    it("starts a Facebook Connexion sociale from the Facebook button", async () => {
      mockedAuthClient.signIn.social.mockResolvedValue({
        data: {},
        error: null,
      })
      window.history.replaceState(null, "", "/?open=login&query=phone")
      renderDialogs({ hasGoogle: true, hasFacebook: true })
      await flush()
      rerender()

      await clickAndFlush(submitButton("Continuer avec Facebook")!)

      expect(mockedAuthClient.signIn.social).toHaveBeenCalledWith({
        provider: "facebook",
        callbackURL: "http://localhost:3000/?query=phone",
      })
    })

    it("shows no Connexion sociale block when no provider is configured", async () => {
      window.history.replaceState(null, "", "/?open=login")
      renderDialogs()
      await flush()
      rerender()

      expect(socialProviderButtons()).toEqual([])
      expect(document.querySelector('[data-slot="field-separator"]')).toBeNull()
    })
  })

  describe("Inscription", () => {
    it("gains no Connexion sociale buttons even when providers are configured", async () => {
      renderDialogs({
        hasGoogle: true,
        hasFacebook: true,
        harness: <SwapHarness />,
      })

      await clickAndSync(
        container.querySelector<HTMLButtonElement>("[data-open-signup]")!
      )

      expect(title()).toBe("Créer un compte")
      expect(socialProviderButtons()).toEqual([])
    })

    it("opens with the default title and swaps back to Connexion with the e-mail prefilled", async () => {
      renderDialogs({ harness: <SwapHarness /> })

      await clickAndSync(
        container.querySelector<HTMLButtonElement>("[data-open-signup]")!
      )

      expect(title()).toBe("Créer un compte")
      setInputValue(emailInput()!, "swap@example.com")
      await clickAndSync(swapButton()!)

      expect(title()).toBe("Connectez-vous pour continuer")
      expect(
        (dialog()?.querySelector('input[type="email"]') as HTMLInputElement)
          ?.value
      ).toBe("swap@example.com")
      expect(new URL(window.location.href).searchParams.get("open")).toBe(
        "login"
      )
    })

    it("shows the commande title when the destination leads to an order", async () => {
      window.history.replaceState(
        null,
        "",
        "/?open=signup&next=/produit/tableau-atlas?variante=2"
      )
      renderDialogs({ harness: <SwapHarness /> })

      await clickAndSync(
        container.querySelector<HTMLButtonElement>("[data-open-signup]")!
      )

      expect(title()).toBe("Créez votre compte pour finaliser votre commande")
    })

    it("derives title, description, and swap from the flow step without form submission", async () => {
      window.history.replaceState(
        null,
        "",
        "/?open=signup&next=/produit/tableau-atlas"
      )
      renderDialogs()
      await flush()
      rerender()

      expect(flowSetters.signup).not.toBeNull()
      expect(title()).toBe("Créez votre compte pour finaliser votre commande")
      expect(swapButton()?.textContent).toBe("Se connecter")

      act(() => flowSetters.signup!("otp", "direct@example.com"))
      expect(title()).toBe("Vérifiez votre e-mail")
      expect(description()).toBe(
        "Vérifiez votre adresse e-mail pour finaliser votre inscription (direct@example.com)."
      )
      expect(swapButton()).toBeNull()

      act(() => flowSetters.signup!("form", "edited@example.com"))
      expect(title()).toBe("Créez votre compte pour finaliser votre commande")
      expect(swapButton()?.textContent).toBe("Se connecter")

      await clickAndSync(swapButton()!)

      expect(title()).toBe("Connectez-vous pour finaliser votre commande")
      expect(emailInput()?.value).toBe("edited@example.com")
      expect(new URL(window.location.href).searchParams.get("open")).toBe(
        "login"
      )
    })

    it("shows the continuer title for a non-commerce destination", async () => {
      window.history.replaceState(null, "", "/?open=signup&next=/compte")
      renderDialogs({ harness: <SwapHarness /> })

      await clickAndSync(
        container.querySelector<HTMLButtonElement>("[data-open-signup]")!
      )

      expect(title()).toBe("Créez votre compte pour continuer")
    })

    it("completes the otp round-trip and opens Connexion with the verified e-mail", async () => {
      renderDialogs({ harness: <SwapHarness /> })

      await clickAndSync(
        container.querySelector<HTMLButtonElement>("[data-open-signup]")!
      )

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
      expect(description()).toBe(
        "Vérifiez votre adresse e-mail pour finaliser votre inscription (jane@example.com)."
      )

      await clickAndFlush(submitButton("Envoyer le code")!)

      setInputValue(
        dialog()!.querySelector<HTMLInputElement>("#otp")!,
        "123456"
      )
      await clickAndFlush(submitButton("Vérifier mon e-mail")!)
      await flush()
      rerender()

      expect(title()).toBe("Connectez-vous pour continuer")
      expect(emailInput()?.value).toBe("jane@example.com")
      expect(new URL(window.location.href).searchParams.get("open")).toBe(
        "login"
      )
      expect(mockedAuthClient.emailOtp.verifyEmail).toHaveBeenCalledWith({
        email: "jane@example.com",
        otp: "123456",
      })
    })
  })
})
