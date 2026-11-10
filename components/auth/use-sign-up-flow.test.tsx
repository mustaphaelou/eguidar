// @vitest-environment happy-dom
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ResultatAuthentification } from "@/components/auth/port-authentification"
import { MESSAGE_SERVEUR_INJOIGNABLE } from "@/components/auth/auth-form-glue"
import { creerPortAuthentificationEnMemoire } from "@/test/port-authentification"
import type { PortAuthentificationEnMemoire } from "@/test/port-authentification"

import { renderHook } from "./test-utils"
import type { SignUpFlow } from "./use-sign-up-flow"
import { useSignUpFlow } from "./use-sign-up-flow"

const captchaStub = vi.hoisted(() => ({
  ready: true,
  jeton: "jeton-inscription",
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
let courantHook: { readonly current: SignUpFlow } | null

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
  onVerified,
}: {
  email?: string
  onVerified?: (email: string) => void
} = {}) {
  courantHook = renderHook(() => useSignUpFlow({ email, onVerified }, port))
  return courantHook
}

function courant(): SignUpFlow {
  expect(courantHook, "le flux est rendu").not.toBeNull()
  return courantHook!.current
}

function saisirNom(valeur: string) {
  act(() => {
    courant().setName(valeur)
  })
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
    await flux.handleSignUp({ preventDefault: () => {} } as React.FormEvent)
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

describe("useSignUpFlow", () => {
  it("inscrit un compte valide et ouvre l'étape du code", async () => {
    rendreFlux()
    saisirNom("Jane Doe")
    saisirEmail("jane@example.com")
    saisirMotDePasse("MotDePasse!12345")

    await soumettre()

    expect(port.appels).toEqual([
      {
        operation: "inscription",
        nom: "Jane Doe",
        email: "jane@example.com",
        motDePasse: "MotDePasse!12345",
        entetes: { "x-captcha-response": captchaStub.jeton },
      },
    ])
    expect(courant().step).toBe("otp")
    expect(courant().loading).toBe(false)
    expect(courant().error).toBeNull()
  })

  it("relève USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL et reste au formulaire", async () => {
    port.repondre = () => ({
      error: {
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "User already exists. Use another email.",
      },
    })

    rendreFlux()
    saisirNom("Jane Doe")
    saisirEmail("jane@example.com")
    saisirMotDePasse("MotDePasse!12345")

    await soumettre()

    expect(courant().error).toBe(
      "Un compte existe déjà avec cette adresse e-mail."
    )
    expect(courant().step).toBe("form")
    expect(courant().loading).toBe(false)
  })

  it("montre un message quand la requête n'atteint pas le serveur", async () => {
    port.repondre = () => Promise.reject(new TypeError("Failed to fetch"))

    rendreFlux()
    saisirNom("Jane Doe")
    saisirEmail("jane@example.com")
    saisirMotDePasse("MotDePasse!12345")

    await soumettre()

    expect(courant().error).toBe(MESSAGE_SERVEUR_INJOIGNABLE)
    expect(courant().step).toBe("form")
    expect(courant().loading).toBe(false)
  })

  it("montre l'attente pendant l'inscription puis l'efface", async () => {
    let resolve!: (resultat: ResultatAuthentification) => void
    port.repondre = () =>
      new Promise<ResultatAuthentification>((resoudre) => {
        resolve = resoudre
      })

    rendreFlux()
    saisirNom("Jane Doe")
    saisirEmail("jane@example.com")
    saisirMotDePasse("MotDePasse!12345")

    const flux = courant()
    await act(async () => {
      flux.handleSignUp({ preventDefault: () => {} } as React.FormEvent)
      await Promise.resolve()
    })
    expect(courant().loading).toBe(true)

    await act(async () => {
      resolve({ error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(courant().loading).toBe(false)
    expect(courant().step).toBe("otp")
  })

  it("réinitialise le Test de sécurité quand l'inscription est rejetée pour lui", async () => {
    port.repondre = () => ({
      error: { code: "VERIFICATION_FAILED", message: "captcha rejected" },
    })

    rendreFlux()
    saisirNom("Jane Doe")
    saisirEmail("jane@example.com")
    saisirMotDePasse("MotDePasse!12345")

    await soumettre()

    expect(captchaStub.reset).toHaveBeenCalled()
    expect(courant().error).toBe(
      "Le test de sécurité a échoué. Veuillez réessayer."
    )
    expect(courant().step).toBe("form")
  })

  it("ne réinitialise pas le Test de sécurité quand le refus est ailleurs", async () => {
    port.repondre = () => ({
      error: { code: "PASSWORD_TOO_SHORT", message: "too short" },
    })

    rendreFlux()
    saisirNom("Jane Doe")
    saisirEmail("jane@example.com")
    saisirMotDePasse("MotDePasse!12345")

    await soumettre()

    expect(captchaStub.reset).not.toHaveBeenCalled()
  })

  it("reçoit son transport et le remet à l'échange de code qu'il compose", async () => {
    const onVerified = vi.fn()

    rendreFlux({ onVerified })
    saisirNom("Jane Doe")
    saisirEmail("jane@example.com")
    saisirMotDePasse("MotDePasse!12345")

    await soumettre()

    expect(courant().step).toBe("otp")

    await envoyerLeCode()
    saisirCode("123456")
    await verifierLeCode()

    expect(port.appels).toEqual([
      {
        operation: "inscription",
        nom: "Jane Doe",
        email: "jane@example.com",
        motDePasse: "MotDePasse!12345",
        entetes: { "x-captcha-response": captchaStub.jeton },
      },
      {
        operation: "envoyerCode",
        email: "jane@example.com",
        type: "email-verification",
        entetes: { "x-captcha-response": captchaStub.jeton },
      },
      {
        operation: "verifierCode",
        email: "jane@example.com",
        code: "123456",
      },
    ])
    expect(onVerified).toHaveBeenCalledWith("jane@example.com")
  })
})
