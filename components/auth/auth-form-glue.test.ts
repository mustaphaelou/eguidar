import { describe, expect, it, vi } from "vitest"

import {
  CODES_REFUS_QUI_DEPENSENT_LE_JETON,
  messageRefusAuthentification,
} from "@/lib/refus-authentification"

import { resolveAuthRefusal, translateAuthError } from "./auth-form-glue"

describe("translateAuthError", () => {
  it("translates known error codes to French user-friendly messages", () => {
    expect(translateAuthError({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "E-mail ou mot de passe invalide."
    )
    expect(translateAuthError({ code: "EMAIL_NOT_VERIFIED" })).toBe(
      "Votre adresse e-mail n'est pas encore vérifiée."
    )
    expect(translateAuthError({ code: "PASSWORD_TOO_SHORT" })).toBe(
      "Le mot de passe doit contenir au moins 15 caractères."
    )
    expect(translateAuthError({ code: "PASSWORD_COMPROMISED" })).toBe(
      "Ce mot de passe apparaît dans une fuite de données connue. Choisissez-en un autre."
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
      "La vérification de sécurité n'a pas abouti. Réessayez dans un instant."
    )
    expect(translateAuthError({ code: "VERIFICATION_FAILED" })).toBe(
      "La vérification de sécurité a échoué. Réessayez."
    )
    expect(translateAuthError({ code: "UNKNOWN_ERROR" })).toBe(
      "La vérification de sécurité n'a pas abouti. Réessayez dans un instant."
    )
  })

  it("never renders the message the library supplied", () => {
    expect(
      translateAuthError({
        code: "PASSWORD_COMPROMISED",
        message:
          "The password you entered has been compromised. Please choose a different password.",
      })
    ).toBe(
      "Ce mot de passe apparaît dans une fuite de données connue. Choisissez-en un autre."
    )
    expect(
      translateAuthError({
        code: "TOO_MANY_ATTEMPTS",
        message: "Too many requests. Please try again later.",
      })
    ).toBe("Trop de tentatives. Veuillez patienter avant de réessayer.")
    expect(
      translateAuthError({
        code: "CODE_INCONNU",
        message: "Something went wrong",
      })
    ).toBe("Une erreur est survenue. Veuillez réessayer.")
  })

  it("falls back to the generic French message when there is no code", () => {
    expect(translateAuthError({ message: "Custom error" })).toBe(
      "Une erreur est survenue. Veuillez réessayer."
    )
    expect(translateAuthError({})).toBe(
      "Une erreur est survenue. Veuillez réessayer."
    )
  })
})

describe("resolveAuthRefusal", () => {
  it.each([...CODES_REFUS_QUI_DEPENSENT_LE_JETON])(
    "resets the Test de sécurité and returns the French message on a %s refusal",
    (code) => {
      const reset = vi.fn()

      expect(resolveAuthRefusal({ code }, reset)).toBe(
        messageRefusAuthentification(code)
      )
      expect(reset).toHaveBeenCalledTimes(1)
    }
  )

  it.each([
    "INVALID_EMAIL_OR_PASSWORD",
    "INVALID_OTP",
    "OTP_EXPIRED",
    "TOO_MANY_ATTEMPTS",
    "ACCOUNT_TEMPORARILY_LOCKED",
    "PASSWORD_COMPROMISED",
    "PASSWORD_TOO_SHORT",
    "EMAIL_NOT_VERIFIED",
  ] as const)("leaves the Test de sécurité alone on a %s refusal", (code) => {
    const reset = vi.fn()

    expect(resolveAuthRefusal({ code }, reset)).toBe(
      messageRefusAuthentification(code)
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
