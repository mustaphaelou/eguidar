// @vitest-environment happy-dom
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MESSAGE_SERVEUR_INJOIGNABLE } from "@/components/auth/auth-form-glue"
import { creerPortAuthentificationEnMemoire } from "@/test/port-authentification"
import type { PortAuthentificationEnMemoire } from "@/test/port-authentification"
import type { ResultatAuthentification } from "@/components/auth/port-authentification"
import type { FournisseurSocial } from "@/lib/oauth-providers"
import { renderHook } from "./test-utils"
import type { SignInFlow } from "./use-sign-in-flow"
import { useSignInFlow } from "./use-sign-in-flow"

const captchaStub = vi.hoisted(() => ({
  ready: true,
  jeton: "jeton-connexion",
  reset: vi.fn(),
}))

vi.mock("@/components/auth/test-de-securite", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/auth/test-de-securite")
  >()),
  useTestDeSecurite: () => ({
    ready: captchaStub.ready,
    headers: { "x-captcha-response": captchaStub.jeton },
    field: null,
    reset: captchaStub.reset,
  }),
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let port: PortAuthentificationEnMemoire
let courantHook: { readonly current: SignInFlow } | null

beforeEach(() => {
  window.history.replaceState(null, "", "/")
  captchaStub.ready = true
  captchaStub.reset.mockClear()
  port = creerPortAuthentificationEnMemoire()
  courantHook = null
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function rendreFlux({
  email = "",
  onSuccess,
  destination = null,
  pageAddress = "/",
  socialReturnAddress = "/",
  port: portDuTest = port,
}: {
  email?: string
  onSuccess?: () => void
  destination?: string | null
  pageAddress?: string
  socialReturnAddress?: string
  port?: PortAuthentificationEnMemoire
} = {}) {
  courantHook = renderHook(() =>
    useSignInFlow(
      { email, onSuccess, destination, pageAddress, socialReturnAddress },
      portDuTest
    )
  )
  return courantHook
}

function courant(): SignInFlow {
  expect(courantHook, "le flux est rendu").not.toBeNull()
  return courantHook!.current
}

function saisirEmail(valeur: string) {
  act(() => {
    courant().setEmail(valeur)
  })
}

function saisirMotDePasse(valeur: string) {
  act(() => {
    courant().setPassword(valeur)
  })
}

function saisirCode(valeur: string) {
  act(() => {
    courant().otp.setOtp(valeur)
  })
}

function soumettre() {
  const flux = courant()
  return act(async () => {
    await flux.handleSignIn({ preventDefault: () => {} } as React.FormEvent)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function envoyerLeCode() {
  await act(async () => {
    await courant().otp.send()
  })
}

async function verifierLeCode() {
  await act(async () => {
    await courant().otp.verify()
  })
}

function revenirAuFormulaire() {
  act(() => {
    courant().backToForm()
  })
}

async function connexionSociale(provider: FournisseurSocial) {
  await act(async () => {
    await courant().handleSocial(provider)
  })
}

describe("useSignInFlow", () => {
  it("navigates to the Destination after successful sign-in", async () => {
    rendreFlux({ destination: "/profil" })
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(window.location.pathname).toBe("/profil")
    expect(port.appels).toEqual([
      {
        operation: "connexionParMotDePasse",
        email: "test@example.com",
        motDePasse: "secret123",
        entetes: { "x-captcha-response": captchaStub.jeton },
      },
    ])
    expect(courant().loading).toBe(false)
  })

  it("calls onSuccess and stays on the page when there is no Destination", async () => {
    const onSuccess = vi.fn()

    rendreFlux({ onSuccess })
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(onSuccess).toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")
    expect(courant().step).toBe("form")
  })

  it("shows a message when the sign-in request does not reach the server", async () => {
    port.repondre = () => Promise.reject(new TypeError("Failed to fetch"))

    rendreFlux()
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(courant().error).toBe(MESSAGE_SERVEUR_INJOIGNABLE)
    expect(courant().step).toBe("form")
    expect(courant().loading).toBe(false)
  })

  it("shows a message when the social sign-in request does not reach the server", async () => {
    port.repondre = () => Promise.reject(new TypeError("Failed to fetch"))

    rendreFlux()
    await connexionSociale("google")

    expect(courant().error).toBe(MESSAGE_SERVEUR_INJOIGNABLE)
  })

  it("shows the pending flag while the sign-in is in flight and clears it after", async () => {
    let resolve!: (resultat: ResultatAuthentification) => void
    port.repondre = () =>
      new Promise<ResultatAuthentification>((resoudre) => {
        resolve = resoudre
      })

    rendreFlux()
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    const flux = courant()
    await act(async () => {
      flux.handleSignIn({ preventDefault: () => {} } as React.FormEvent)
      await Promise.resolve()
    })
    expect(courant().loading).toBe(true)

    await act(async () => {
      resolve({ error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(courant().loading).toBe(false)
  })

  it("moves to the code-verification step when the e-mail is not verified", async () => {
    port.repondre = () => ({
      error: { code: "EMAIL_NOT_VERIFIED", message: "not verified" },
    })
    const onSuccess = vi.fn()

    rendreFlux({ onSuccess, destination: "/profil" })
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(courant().step).toBe("otp")
    expect(onSuccess).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")
    expect(courant().error).toBeNull()
    expect(courant().loading).toBe(false)
  })

  it("surfaces INVALID_EMAIL_OR_PASSWORD and stays on the form step", async () => {
    port.repondre = () => ({
      error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "bad credentials" },
    })

    rendreFlux()
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(courant().error).toBe("E-mail ou mot de passe invalide.")
    expect(courant().step).toBe("form")
  })

  it("resets the Test de sécurité so a rejected sign-in retries with a fresh jeton", async () => {
    port.repondre = () => ({
      error: { code: "VERIFICATION_FAILED", message: "captcha rejected" },
    })

    rendreFlux()
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(captchaStub.reset).toHaveBeenCalled()
    expect(courant().error).toBe(
      "Le test de sécurité a échoué. Veuillez réessayer."
    )
    expect(courant().step).toBe("form")
  })

  it("does not reset the Test de sécurité when the sign-in is refused for another reason", async () => {
    port.repondre = () => ({
      error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "bad credentials" },
    })

    rendreFlux()
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(captchaStub.reset).not.toHaveBeenCalled()
  })

  it("revient au formulaire depuis l'étape du code avec l'adresse conservée", async () => {
    port.repondre = () => ({
      error: { code: "EMAIL_NOT_VERIFIED", message: "not verified" },
    })

    rendreFlux({ email: "test@example.com" })
    saisirMotDePasse("secret123")

    await soumettre()

    expect(courant().step).toBe("otp")

    revenirAuFormulaire()

    expect(courant().step).toBe("form")
    expect(courant().email).toBe("test@example.com")
    expect(courant().error).toBeNull()
  })

  it("walks the tail from the unverified e-mail to the code step, the verified notice, and a successful sign-in", async () => {
    let connexions = 0
    port.repondre = (appel) => {
      if (appel.operation === "connexionParMotDePasse") {
        connexions += 1
        if (connexions === 1) {
          return {
            error: { code: "EMAIL_NOT_VERIFIED", message: "not verified" },
          }
        }
      }
      return { error: null }
    }
    const onSuccess = vi.fn()

    rendreFlux({ onSuccess, destination: "/profil" })
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(courant().step).toBe("otp")
    expect(onSuccess).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/")

    saisirCode("123456")
    await verifierLeCode()

    expect(courant().step).toBe("form")
    expect(courant().notice).toContain("Votre e-mail est vérifié")

    await soumettre()

    expect(window.location.pathname).toBe("/profil")
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("reçoit son transport et le remet à l'échange de code qu'il compose", async () => {
    port.repondre = (appel) =>
      appel.operation === "connexionParMotDePasse"
        ? { error: { code: "EMAIL_NOT_VERIFIED", message: "not verified" } }
        : { error: null }

    rendreFlux({ destination: "/profil" })
    saisirEmail("test@example.com")
    saisirMotDePasse("secret123")

    await soumettre()

    expect(courant().step).toBe("otp")

    await envoyerLeCode()
    saisirCode("123456")
    await verifierLeCode()

    expect(port.appels).toEqual([
      {
        operation: "connexionParMotDePasse",
        email: "test@example.com",
        motDePasse: "secret123",
        entetes: { "x-captcha-response": captchaStub.jeton },
      },
      {
        operation: "envoyerCode",
        email: "test@example.com",
        type: "email-verification",
        entetes: { "x-captcha-response": captchaStub.jeton },
      },
      {
        operation: "verifierCode",
        email: "test@example.com",
        code: "123456",
      },
    ])
    expect(courant().step).toBe("form")
    expect(courant().notice).toContain("Votre e-mail est vérifié")
  })

  it.each([
    {
      provider: "google",
      pageAddress: "/panier",
      socialReturnAddress: "/panier?open=login",
      expected: "http://localhost:3000/panier",
      errorCallback: "http://localhost:3000/panier?open=login",
    },
    {
      provider: "facebook",
      pageAddress: "/panier",
      socialReturnAddress: "/panier?open=login",
      expected: "http://localhost:3000/panier",
      errorCallback: "http://localhost:3000/panier?open=login",
    },
    {
      provider: "google",
      pageAddress: "/?query=phone",
      socialReturnAddress: "/?query=phone&open=login",
      expected: "http://localhost:3000/?query=phone",
      errorCallback: "http://localhost:3000/?query=phone&open=login",
    },
    {
      provider: "facebook",
      pageAddress: "/?query=phone",
      socialReturnAddress: "/?query=phone&open=login",
      expected: "http://localhost:3000/?query=phone",
      errorCallback: "http://localhost:3000/?query=phone&open=login",
    },
    {
      provider: "google",
      pageAddress: "/produits?query=phone",
      socialReturnAddress: "/produits?query=phone&open=login",
      expected: "http://localhost:3000/produits?query=phone",
      errorCallback: "http://localhost:3000/produits?query=phone&open=login",
    },
    {
      provider: "facebook",
      pageAddress: "/produits?query=phone",
      socialReturnAddress: "/produits?query=phone&open=login",
      expected: "http://localhost:3000/produits?query=phone",
      errorCallback: "http://localhost:3000/produits?query=phone&open=login",
    },
    {
      provider: "google",
      pageAddress: "/",
      socialReturnAddress: "/?open=login&next=%2Fadmin",
      expected: "http://localhost:3000/",
      errorCallback: "http://localhost:3000/?open=login&next=%2Fadmin",
    },
    {
      provider: "facebook",
      pageAddress: "/",
      socialReturnAddress: "/?open=login&next=%2Fadmin",
      expected: "http://localhost:3000/",
      errorCallback: "http://localhost:3000/?open=login&next=%2Fadmin",
    },
  ] as const)(
    "computes the $provider Connexion sociale callbackURL from $pageAddress",
    async ({
      provider,
      pageAddress,
      socialReturnAddress,
      expected,
      errorCallback,
    }) => {
      rendreFlux({ pageAddress, socialReturnAddress })

      await connexionSociale(provider)

      expect(port.appels).toEqual([
        {
          operation: "connexionSociale",
          fournisseur: provider,
          adresseDeRetour: expected,
          adresseDeRetourEnEchec: errorCallback,
        },
      ])
    }
  )
})
