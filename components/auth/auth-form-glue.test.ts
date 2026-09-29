import { describe, expect, it } from "vitest"

import { isCaptchaRejection, translateAuthError } from "./auth-form-glue"

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
    expect(translateAuthError({ code: "MISSING_RESPONSE" })).toBe(
      "Veuillez valider le test de sécurité (Turnstile)."
    )
    expect(translateAuthError({ code: "VERIFICATION_FAILED" })).toBe(
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

describe("isCaptchaRejection", () => {
  it("matches the refusal the Turnstile handler returns", () => {
    expect(isCaptchaRejection({ code: "VERIFICATION_FAILED" })).toBe(true)
  })

  it("does not treat a missing jeton as a refusal the widget recovers from", () => {
    expect(isCaptchaRejection({ code: "MISSING_RESPONSE" })).toBe(false)
  })

  it("does not match other error codes, missing codes or a missing error", () => {
    expect(isCaptchaRejection({ code: "INVALID_OTP" })).toBe(false)
    expect(isCaptchaRejection({ code: "TOO_MANY_ATTEMPTS" })).toBe(false)
    expect(isCaptchaRejection({})).toBe(false)
    expect(isCaptchaRejection(null)).toBe(false)
    expect(isCaptchaRejection(undefined)).toBe(false)
  })
})
