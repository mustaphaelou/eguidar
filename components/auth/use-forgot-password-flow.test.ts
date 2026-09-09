// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { translateAuthError } from "./auth-form-glue"

describe("translateAuthError", () => {
  it("translates known error codes to French user-friendly messages", () => {
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
    expect(translateAuthError({ code: "PASSWORD_TOO_SHORT" })).toBe(
      "Le mot de passe doit contenir au moins 8 caractères."
    )
    expect(translateAuthError({ code: "MISSING_RESPONSE" })).toBe(
      "Veuillez valider le test de sécurité (Turnstile)."
    )
    expect(
      translateAuthError({ code: "PASSWORDS_DO_NOT_MATCH" })
    ).toBe("Les mots de passe ne correspondent pas.")
  })

  it("falls back to message or default error message", () => {
    expect(translateAuthError({ message: "Custom error" })).toBe(
      "Custom error"
    )
    expect(translateAuthError({})).toBe(
      "Une erreur est survenue. Veuillez réessayer."
    )
  })
})
