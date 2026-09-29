"use client"

/** Le code que le serveur envoie quand il refuse le jeton du Test de sécurité. */
const REFUS_DU_TEST_DE_SECURITE = "VERIFICATION_FAILED"

export function translateAuthError(error: {
  code?: string
  message?: string
}): string {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou mot de passe invalide."
    case "EMAIL_NOT_VERIFIED":
      return "Votre adresse e-mail n'est pas encore vérifiée."
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
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
    case "MISSING_RESPONSE":
      return "Veuillez valider le test de sécurité (Turnstile)."
    case REFUS_DU_TEST_DE_SECURITE:
      return "Le test de sécurité a échoué. Veuillez réessayer."
    default:
      return error.message ?? "Une erreur est survenue. Veuillez réessayer."
  }
}

/**
 * Le refus d'un Envoi protégé, de bout en bout : remettre le Test de sécurité
 * à zéro quand le serveur a refusé le jeton, et rendre le message français dans
 * tous les cas. Les trois sites d'appel l'appellent, ils n'en écrivent plus la
 * règle.
 */
export function resolveAuthRefusal(
  error: { code?: string; message?: string } | null | undefined,
  reset: () => void
): string {
  if (isTestDeSecuriteRefusal(error)) reset()
  return translateAuthError(error ?? {})
}

function isTestDeSecuriteRefusal(
  error: { code?: string } | null | undefined
): boolean {
  return error?.code === REFUS_DU_TEST_DE_SECURITE
}
