"use client"

export function translateAuthError(error: {
  code?: string
  message?: string
}): string {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou mot de passe invalide."
    case "EMAIL_NOT_VERIFIED":
      return "Votre adresse e-mail n'est pas encore vérifiée."
    case "USER_ALREADY_EXISTS":
      return "Un compte existe déjà avec cette adresse e-mail."
    case "PASSWORD_TOO_SHORT":
      return "Le mot de passe doit contenir au moins 8 caractères."
    case "USER_NOT_FOUND":
      return "Aucun compte n'est associé à cette adresse e-mail."
    case "INVALID_OTP":
      return "Le code de vérification est invalide ou incorrect."
    case "OTP_EXPIRED":
      return "Le code de vérification a expiré. Veuillez en demander un nouveau."
    case "TOO_MANY_ATTEMPTS":
      return "Trop de tentatives. Veuillez patienter avant de réessayer."
    case "PASSWORDS_DO_NOT_MATCH":
      return "Les mots de passe ne correspondent pas."
    case "MISSING_RESPONSE":
      return "Veuillez valider le test de sécurité (Turnstile)."
    case "INVALID_RESPONSE":
      return "Le test de sécurité a échoué. Veuillez réessayer."
    default:
      return error.message ?? "Une erreur est survenue. Veuillez réessayer."
  }
}
