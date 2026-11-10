"use client"

import type { RefusAuthentification } from "@/components/auth/port-authentification"
import { MESSAGE_MOT_DE_PASSE_TROP_COURT } from "@/lib/auth-form-schemas"
import {
  CODE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE,
} from "@/lib/echecs-connexion-regles"

export function translateAuthError(error: RefusAuthentification): string {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou mot de passe invalide."
    case "EMAIL_NOT_VERIFIED":
      return "Votre adresse e-mail n'est pas encore vérifiée."
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Un compte existe déjà avec cette adresse e-mail."
    case "PASSWORD_TOO_SHORT":
      return MESSAGE_MOT_DE_PASSE_TROP_COURT
    case "USER_NOT_FOUND":
      return "Aucun compte n'est associé à cette adresse e-mail."
    case "INVALID_OTP":
      return "Le code de vérification est invalide ou incorrect."
    case "OTP_EXPIRED":
      return "Le code de vérification a expiré. Veuillez en demander un nouveau."
    case "TOO_MANY_ATTEMPTS":
      return "Trop de tentatives. Veuillez patienter avant de réessayer."
    case CODE_COMPTE_TEMPORAIREMENT_VERROUILLE:
      return MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE
    case "MISSING_RESPONSE":
      return "Veuillez valider le test de sécurité (Turnstile)."
    case "VERIFICATION_FAILED":
      return "Le test de sécurité a échoué. Veuillez réessayer."
    default:
      return error.message ?? "Une erreur est survenue. Veuillez réessayer."
  }
}

export function translateConnexionSocialeFailure(
  code: string | null
): string | null {
  switch (code) {
    case null:
      return null
    case "access_denied":
      return "La connexion a été annulée. Vous pouvez réessayer."
    case "email_not_found":
      return "Le fournisseur ne nous a pas transmis d'adresse e-mail. Continuez avec un autre fournisseur ou inscrivez-vous avec une adresse e-mail."
    default:
      return "La connexion a échoué. Veuillez réessayer."
  }
}

export function resolveAuthRefusal(
  error: RefusAuthentification | null | undefined,
  reset: () => void
): string {
  if (isTestDeSecuriteRefusal(error)) reset()
  return translateAuthError(error ?? {})
}

function isTestDeSecuriteRefusal(
  error: RefusAuthentification | null | undefined
): boolean {
  return error?.code === "VERIFICATION_FAILED"
}
