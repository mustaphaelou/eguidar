import { describe, expect, it, vi } from "vitest"

import { resolveAuthRefusal, translateAuthError } from "./auth-form-glue"

describe("translateAuthError", () => {
  it("translates known error codes to French user-friendly messages", () => {
    expect(translateAuthError({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "E-mail ou mot de passe invalide."
    )
    expect(translateAuthError({ code: "EMAIL_NOT_VERIFIED" })).toBe(
      "Votre adresse e-mail n'est pas encore vérifiée."
    )
    expect(
      translateAuthError({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })
    ).toBe("Un compte existe déjà avec cette adresse e-mail.")
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
    expect(translateAuthError({ code: "ACCOUNT_TEMPORARILY_LOCKED" })).toBe(
      "Trop de tentatives de connexion sur ce compte. Réessayez dans quelques minutes."
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

describe("resolveAuthRefusal", () => {
  it("resets the Test de sécurité and returns the French message on a refusal", () => {
    const reset = vi.fn()

    expect(resolveAuthRefusal({ code: "VERIFICATION_FAILED" }, reset)).toBe(
      "Le test de sécurité a échoué. Veuillez réessayer."
    )
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("leaves the Test de sécurité alone when the error is another code", () => {
    const reset = vi.fn()

    expect(resolveAuthRefusal({ code: "INVALID_OTP" }, reset)).toBe(
      "Le code de vérification est invalide ou incorrect."
    )
    expect(resolveAuthRefusal({ code: "TOO_MANY_ATTEMPTS" }, reset)).toBe(
      "Trop de tentatives. Veuillez patienter avant de réessayer."
    )
    expect(reset).not.toHaveBeenCalled()
  })

  it("does not treat a missing jeton as a refusal the Test de sécurité recovers from", () => {
    const reset = vi.fn()

    expect(resolveAuthRefusal({ code: "MISSING_RESPONSE" }, reset)).toBe(
      "Veuillez valider le test de sécurité (Turnstile)."
    )
    expect(reset).not.toHaveBeenCalled()
  })

  it("leaves the Test de sécurité alone for a missing code and for no error at all", () => {
    const reset = vi.fn()
    const generique = "Une erreur est survenue. Veuillez réessayer."

    expect(resolveAuthRefusal({}, reset)).toBe(generique)
    expect(resolveAuthRefusal(null, reset)).toBe(generique)
    expect(resolveAuthRefusal(undefined, reset)).toBe(generique)
    expect(reset).not.toHaveBeenCalled()
  })
})
