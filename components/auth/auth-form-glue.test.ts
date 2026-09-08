// @vitest-environment happy-dom
import { createElement } from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  captchaHeaders,
  translateAuthError,
  useCaptcha,
} from "./auth-form-glue"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.unstubAllEnvs()
})

function renderCaptcha() {
  let current: ReturnType<typeof useCaptcha> | undefined
  function Harness() {
    current = useCaptcha()
    return null
  }
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(createElement(Harness))
  })
  return {
    get value() {
      return current as ReturnType<typeof useCaptcha>
    },
    rerender() {
      act(() => {
        root.render(createElement(Harness))
      })
    },
  }
}

describe("translateAuthError", () => {
  it("translates known error codes to French user-friendly messages", () => {
    expect(translateAuthError({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "E-mail ou mot de passe invalide."
    )
    expect(translateAuthError({ code: "EMAIL_NOT_VERIFIED" })).toBe(
      "Votre adresse e-mail n'est pas encore vérifiée."
    )
    expect(translateAuthError({ code: "USER_ALREADY_EXISTS" })).toBe(
      "Un compte existe déjà avec cette adresse e-mail."
    )
    expect(translateAuthError({ code: "PASSWORD_TOO_SHORT" })).toBe(
      "Le mot de passe doit contenir au moins 8 caractères."
    )
    expect(translateAuthError({ code: "USER_NOT_FOUND" })).toBe(
      "Aucun compte n'est associé à cette adresse e-mail."
    )
    expect(translateAuthError({ code: "INVALID_OTP" })).toBe(
      "Le code de vérification est invalide ou incorrect."
    )
    expect(translateAuthError({ code: "OTP_EXPIRED" })).toBe(
      "Le code de vérification a expiré. Veuillez en demander un nouveau."
    )
    expect(translateAuthError({ code: "TOO_MANY_ATTEMPTS" })).toBe(
      "Trop de tentatives. Veuillez patienter avant de réessayer."
    )
    expect(translateAuthError({ code: "PASSWORDS_DO_NOT_MATCH" })).toBe(
      "Les mots de passe ne correspondent pas."
    )
    expect(translateAuthError({ code: "MISSING_RESPONSE" })).toBe(
      "Veuillez valider le test de sécurité (Turnstile)."
    )
    expect(translateAuthError({ code: "INVALID_RESPONSE" })).toBe(
      "Le test de sécurité a échoué. Veuillez réessayer."
    )
  })

  it("falls back to the raw message when present", () => {
    expect(translateAuthError({ message: "Custom error" })).toBe("Custom error")
  })

  it("falls back to the generic French message when there is no message", () => {
    expect(translateAuthError({})).toBe(
      "Une erreur est survenue. Veuillez réessayer."
    )
  })
})

describe("captchaHeaders", () => {
  it("returns the x-captcha-response header object for a token", () => {
    expect(captchaHeaders("abc123")).toEqual({
      "x-captcha-response": "abc123",
    })
  })

  it("returns undefined for a null token", () => {
    expect(captchaHeaders(null)).toBeUndefined()
  })
})

describe("useCaptcha", () => {
  it("is always ready when the site key is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")

    const hook = renderCaptcha()

    expect(hook.value.required).toBe(false)
    expect(hook.value.ready).toBe(true)
  })

  it("is required but not ready without a token when the site key is set", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    const hook = renderCaptcha()

    expect(hook.value.required).toBe(true)
    expect(hook.value.ready).toBe(false)
    expect(hook.value.token).toBeNull()
  })

  it("becomes ready once a token arrives and not ready again when it clears to null", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    const hook = renderCaptcha()
    act(() => {
      hook.value.onChange("token-1")
    })
    hook.rerender()

    expect(hook.value.token).toBe("token-1")
    expect(hook.value.ready).toBe(true)

    act(() => {
      hook.value.onChange(null)
    })
    hook.rerender()

    expect(hook.value.token).toBeNull()
    expect(hook.value.ready).toBe(false)
  })
})
