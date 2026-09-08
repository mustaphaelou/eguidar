// @vitest-environment happy-dom
import {
  flush,
  restorePreviousUrl,
  mockNextLink,
  mockNextNavigation,
  navigationSpies,
  resetNavigation,
} from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AuthDialogs,
  AuthDialogsProvider,
  useAuthDialogs,
} from "./auth-dialogs"
import { RequireAuth } from "./require-auth"
import { SignInButton } from "@/components/storefront/sign-in-button"
import { parseAuthParams } from "@/lib/lien-de-connexion"
import { useSearchParams } from "next/navigation"

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    value: { data: null as { user: { id: string } } | null, isPending: false },
  },
}))

vi.mock("next/navigation", () => mockNextNavigation())

vi.mock("next/link", () => mockNextLink())

vi.mock("@/components/auth/turnstile", () => ({
  Turnstile: () => <div data-testid="turnstile-challenge" />,
}))

vi.mock("@/lib/client", () => ({
  useSession: () => sessionState.value,
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

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []
let currentElement: (() => ReactElement) | null = null

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/")
  sessionState.value = { data: null, isPending: false }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  currentElement = null
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
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

function storefront() {
  return (
    <AuthDialogs>
      <SignInButton />
    </AuthDialogs>
  )
}

function headerButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Connexion"]'
  )!
}

function dialog() {
  return document.querySelector('[data-slot="dialog-content"]')
}

function closeButton() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Fermer")
  )
}

function locationParams() {
  return new URL(window.location.href).searchParams
}

function overlay() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  })
}

function submitButton() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.type === "submit"
  )!
}

function swapButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) =>
      button.type === "button" && button.textContent?.includes(label)
  )!
}

describe("AuthDialogs", () => {
  it("opens the Connexion modal from the header user button and keeps it open", async () => {
    render(() => storefront())
    expect(dialog()).toBeNull()

    act(() => headerButton().click())
    await flush()
    rerender()

    expect(dialog()).not.toBeNull()
    expect(
      document.querySelector('[data-slot="dialog-title"]')?.textContent
    ).toBe("Connectez-vous pour continuer")
    expect(locationParams().get("open")).toBe("login")

    rerender()

    expect(dialog()).not.toBeNull()
  })

  it("unmounts the modal and cleans open and next from the URL when the close button is clicked", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/produit/tableau-atlas&ville=casa"
    )
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("ville")).toBe("casa")

    rerender()

    expect(dialog()).toBeNull()
  })

  it("opens the Connexion modal as a history entry so the back button dismisses it", async () => {
    render(() => storefront())

    act(() => headerButton().click())
    await flush()
    rerender()

    expect(dialog()).not.toBeNull()
    expect(locationParams().get("open")).toBe("login")

    act(() => {
      restorePreviousUrl()
    })
    rerender()

    expect(dialog()).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(locationParams().has("open")).toBe(false)

    rerender()

    expect(dialog()).toBeNull()
  })

  it("unmounts the Turnstile challenge when the modal is dismissed", async () => {
    render(() => storefront())

    act(() => headerButton().click())
    await flush()
    rerender()

    expect(dialog()).not.toBeNull()
    expect(
      document.querySelector('[data-testid="turnstile-challenge"]')
    ).not.toBeNull()

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(
      document.querySelector('[data-testid="turnstile-challenge"]')
    ).toBeNull()
  })

  it("opens the Connexion modal from a Lien de connexion in the URL", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier")
    render(() => storefront())
    rerender()

    expect(dialog()).not.toBeNull()
    expect(locationParams().get("open")).toBe("login")
    expect(locationParams().get("next")).toBe("/panier")
  })

  it("silently sanitizes a Lien de connexion for an authenticated Client without mounting any modal", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/panier&q=chaussures"
    )
    ;(window as unknown as Record<string, unknown>).__pageInstance = true
    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    render(() => storefront())
    rerender()

    expect(dialog()).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("q")).toBe("chaussures")
    expect(window.location.pathname).toBe("/")
    expect((window as unknown as Record<string, unknown>).__pageInstance).toBe(
      true
    )
    expect(headerButton()).not.toBeNull()

    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
  })

  it("silently sanitizes Inscription parameters for an authenticated Client without mounting any modal", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=signup&next=/compte&tri=prix"
    )
    ;(window as unknown as Record<string, unknown>).__pageInstance = true
    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    render(() => storefront())
    rerender()

    expect(dialog()).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("tri")).toBe("prix")
    expect((window as unknown as Record<string, unknown>).__pageInstance).toBe(
      true
    )
  })

  it("never flashes the Connexion modal while the session check resolves, then sanitizes", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier")
    sessionState.value = { data: null, isPending: true }
    render(() => storefront())

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBe("login")

    sessionState.value = { data: { user: { id: "1" } }, isPending: false }
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()

    rerender()

    expect(dialog()).toBeNull()
  })

  it("dismisses the Connexion modal on Escape and cleans open and next from the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=login&next=/produit/tableau-atlas&ville=casa"
    )
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("ville")).toBe("casa")

    rerender()

    expect(dialog()).toBeNull()
  })

  it("dismisses the Connexion modal on backdrop click and cleans open and next from the URL", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier&tri=prix")
    render(() => storefront())
    rerender()
    expect(overlay()).not.toBeNull()

    act(() => {
      overlay()!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("tri")).toBe("prix")

    rerender()

    expect(dialog()).toBeNull()
  })

  it("dismisses the Inscription modal with the close button, Escape, and the backdrop while cleaning the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/?open=signup&next=/compte&ville=rabat"
    )
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("ville")).toBe("rabat")

    window.history.replaceState(null, "", "/?open=signup")
    rerender()
    expect(dialog()).not.toBeNull()

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()

    window.history.replaceState(null, "", "/?open=signup")
    rerender()
    expect(overlay()).not.toBeNull()

    act(() => {
      overlay()!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
  })

  it("closes cleanly after swapping from Connexion to Inscription without reopening", async () => {
    render(() => storefront())

    act(() => headerButton().click())
    await flush()
    rerender()
    expect(locationParams().get("open")).toBe("login")

    act(() => swapButton("Inscrivez-vous").click())
    await flush()
    rerender()

    expect(dialog()).not.toBeNull()
    expect(locationParams().get("open")).toBe("signup")
    expect(
      document.querySelector('[data-slot="dialog-title"]')?.textContent
    ).toBe("Créez votre compte pour continuer")

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()

    rerender()

    expect(dialog()).toBeNull()
  })

  it("closes cleanly after swapping from Inscription to Connexion without reopening", async () => {
    window.history.replaceState(null, "", "/?open=signup")
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => swapButton("Se connecter").click())
    await flush()
    rerender()

    expect(locationParams().get("open")).toBe("login")

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()

    rerender()

    expect(dialog()).toBeNull()
  })

  it("keeps the shopper on the gated page with the refusal placeholder visible after dismissing the Connexion modal", async () => {
    window.history.replaceState(null, "", "/checkout?ville=casa")
    render(() => (
      <AuthDialogs>
        <RequireAuth />
      </AuthDialogs>
    ))
    await flush()
    rerender()

    expect(dialog()).not.toBeNull()
    expect(container.textContent).toContain("Connectez-vous pour continuer")
    expect(locationParams().get("open")).toBe("login")
    expect(locationParams().get("next")).toBe("/checkout?ville=casa")

    act(() => closeButton()!.click())
    rerender()

    expect(dialog()).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain("Connectez-vous pour continuer")
    expect(new URL(window.location.href).pathname).toBe("/checkout")
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("ville")).toBe("casa")

    rerender()

    expect(dialog()).toBeNull()
    expect(container.textContent).toContain("Connectez-vous pour continuer")
  })

  it("resets transient form field errors when the Connexion modal is dismissed and reopened", async () => {
    render(() => storefront())

    act(() => headerButton().click())
    await flush()
    rerender()

    act(() => submitButton().click())
    rerender()

    const errors = [
      ...document.querySelectorAll('[data-slot="field-error"]'),
    ].map((errorElement) => errorElement.textContent)
    expect(errors).toContain("Saisissez votre adresse e-mail.")
    expect(errors).toContain("Saisissez votre mot de passe.")

    pressEscape()
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()

    act(() => headerButton().click())
    await flush()
    rerender()

    expect(dialog()).not.toBeNull()
    expect(document.querySelector('[data-slot="field-error"]')).toBeNull()
    expect(locationParams().get("open")).toBe("login")
  })

  it("leaves no residual auth parameters after rapid consecutive Escape presses", () => {
    window.history.replaceState(null, "", "/?open=login&next=/panier")
    render(() => storefront())
    rerender()
    expect(dialog()).not.toBeNull()

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    rerender()

    expect(dialog()).toBeNull()
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
  })

  it("cleans up an invalid ?open= value while keeping unrelated params", () => {
    window.history.replaceState(null, "", "/?open=bogus&q=chaussures")
    render(() => storefront())
    rerender()

    expect(navigationSpies.replace).toHaveBeenCalledTimes(1)
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("q")).toBe("chaussures")
    expect(dialog()).toBeNull()
  })

  it("does not rewrite the URL when there is no Lien de connexion to clean", () => {
    render(() => storefront())
    rerender()

    expect(navigationSpies.replace).not.toHaveBeenCalled()
  })
})

function ControllerHarness() {
  const { openLogin, openSignUp, close } = useAuthDialogs()
  const { dialog } = parseAuthParams(useSearchParams())
  return (
    <div>
      <div data-dialog={dialog ?? "none"} />
      <button type="button" data-open-login onClick={() => openLogin()} />
      <button type="button" data-open-signup onClick={() => openSignUp()} />
      <button type="button" data-close onClick={() => close()} />
    </div>
  )
}

function controllerHarness() {
  return (
    <AuthDialogsProvider>
      <ControllerHarness />
    </AuthDialogsProvider>
  )
}

function controllerDialog() {
  return container.querySelector("[data-dialog]")?.getAttribute("data-dialog")
}

function controllerClick(name: string) {
  act(() =>
    container.querySelector<HTMLButtonElement>(`[data-${name}]`)!.click()
  )
}

describe("AuthDialogsProvider controller interface", () => {
  it("opens the Connexion modal with the current page as the default Destination post-connexion", async () => {
    window.history.replaceState(null, "", "/panier?q=chaussures")
    render(() => controllerHarness())

    controllerClick("open-login")
    await flush()

    expect(navigationSpies.push).toHaveBeenCalledExactlyOnceWith(
      "/panier?q=chaussures&open=login&next=%2Fpanier%3Fq%3Dchaussures",
      { scroll: false }
    )
    expect(locationParams().get("open")).toBe("login")
    expect(locationParams().get("next")).toBe("/panier?q=chaussures")

    rerender()

    expect(controllerDialog()).toBe("login")
  })

  it("opens the Inscription modal without touching the Destination post-connexion", async () => {
    window.history.replaceState(null, "", "/panier?q=chaussures")
    render(() => controllerHarness())

    controllerClick("open-signup")
    await flush()

    expect(navigationSpies.push).toHaveBeenCalledExactlyOnceWith(
      "/panier?q=chaussures&open=signup",
      { scroll: false }
    )

    rerender()

    expect(controllerDialog()).toBe("signup")
  })

  it("closes through a replace that keeps unrelated params and notifies consumers", () => {
    window.history.replaceState(
      null,
      "",
      "/panier?open=login&next=/profil&q=chaussures"
    )
    render(() => controllerHarness())
    rerender()
    expect(controllerDialog()).toBe("login")

    controllerClick("close")

    expect(navigationSpies.replace).toHaveBeenCalledExactlyOnceWith("/panier?q=chaussures", {
      scroll: false,
    })
    expect(locationParams().get("open")).toBeNull()
    expect(locationParams().get("next")).toBeNull()
    expect(locationParams().get("q")).toBe("chaussures")

    rerender()

    expect(controllerDialog()).toBe("none")
  })

  it("closes down to the bare pathname when nothing else remains", () => {
    window.history.replaceState(null, "", "/panier?open=login&next=/panier")
    render(() => controllerHarness())

    controllerClick("close")

    expect(navigationSpies.replace).toHaveBeenCalledExactlyOnceWith("/panier", {
      scroll: false,
    })
    expect(new URL(window.location.href).search).toBe("")
  })

  it("does not navigate when closing with no auth params to clear", () => {
    render(() => controllerHarness())

    controllerClick("close")

    expect(navigationSpies.replace).not.toHaveBeenCalled()
  })

  it("does not navigate when the requested Lien de connexion is already in the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/panier?open=login&next=%2Fpanier&q=chaussures"
    )
    render(() => controllerHarness())

    controllerClick("open-login")

    expect(navigationSpies.push).not.toHaveBeenCalled()
    expect(navigationSpies.replace).not.toHaveBeenCalled()
  })

  it("reuses an existing validated Destination post-connexion when opening", async () => {
    window.history.replaceState(null, "", "/panier?next=/profil")
    render(() => controllerHarness())

    controllerClick("open-login")
    await flush()

    expect(navigationSpies.push).toHaveBeenCalledExactlyOnceWith(
      "/panier?next=%2Fprofil&open=login",
      { scroll: false }
    )
  })

  it("replaces an invalid Destination post-connexion with the current page address", async () => {
    window.history.replaceState(null, "", "/panier?next=//evil.example")
    render(() => controllerHarness())

    controllerClick("open-login")
    await flush()

    expect(navigationSpies.push).toHaveBeenCalledExactlyOnceWith(
      "/panier?next=%2Fpanier&open=login",
      { scroll: false }
    )
  })

  it("preserves the URL fragment when opening the Connexion modal", async () => {
    window.history.replaceState(null, "", "/panier?q=chaussures#avis")
    render(() => controllerHarness())

    controllerClick("open-login")
    await flush()

    expect(navigationSpies.push).toHaveBeenCalledExactlyOnceWith(
      "/panier?q=chaussures&open=login&next=%2Fpanier%3Fq%3Dchaussures%23avis#avis",
      { scroll: false }
    )
    expect(new URL(window.location.href).hash).toBe("#avis")
  })

  it("preserves the URL fragment when closing and clearing auth params", () => {
    window.history.replaceState(
      null,
      "",
      "/panier?open=login&next=/profil&q=chaussures#avis"
    )
    render(() => controllerHarness())
    rerender()
    expect(controllerDialog()).toBe("login")

    controllerClick("close")

    expect(navigationSpies.replace).toHaveBeenCalledExactlyOnceWith(
      "/panier?q=chaussures#avis",
      { scroll: false }
    )
    expect(locationParams().get("open")).toBeNull()
    expect(new URL(window.location.href).hash).toBe("#avis")

    rerender()

    expect(controllerDialog()).toBe("none")
  })
})
