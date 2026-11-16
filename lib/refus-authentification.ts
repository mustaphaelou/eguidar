import { MESSAGE_MOT_DE_PASSE_TROP_COURT } from "@/lib/auth-form-schemas"
import {
  CODE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE,
} from "@/lib/echecs-connexion-regles"

export const CODES_REFUS_AUTHENTIFICATION = [
  "INVALID_EMAIL_OR_PASSWORD",
  "EMAIL_NOT_VERIFIED",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_COMPROMISED",
  "INVALID_OTP",
  "OTP_EXPIRED",
  "TOO_MANY_ATTEMPTS",
  CODE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  "MISSING_RESPONSE",
  "VERIFICATION_FAILED",
  "UNKNOWN_ERROR",
] as const

export type CodeRefusAuthentification =
  (typeof CODES_REFUS_AUTHENTIFICATION)[number]

export const MESSAGE_REFUS_AUTHENTIFICATION_GENERIQUE =
  "Une erreur est survenue. Veuillez réessayer."

export const MESSAGES_REFUS_AUTHENTIFICATION: Record<
  CodeRefusAuthentification,
  string
> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou mot de passe invalide.",
  EMAIL_NOT_VERIFIED: "Votre adresse e-mail n'est pas encore vérifiée.",
  PASSWORD_TOO_SHORT: MESSAGE_MOT_DE_PASSE_TROP_COURT,
  PASSWORD_COMPROMISED:
    "Ce mot de passe apparaît dans une fuite de données connue. Choisissez-en un autre.",
  INVALID_OTP: "Le code de vérification est invalide ou incorrect.",
  OTP_EXPIRED:
    "Le code de vérification a expiré. Veuillez en demander un nouveau.",
  TOO_MANY_ATTEMPTS:
    "Trop de tentatives. Veuillez patienter avant de réessayer.",
  [CODE_COMPTE_TEMPORAIREMENT_VERROUILLE]:
    MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  MISSING_RESPONSE:
    "La vérification de sécurité n'a pas abouti. Réessayez dans un instant.",
  VERIFICATION_FAILED: "La vérification de sécurité a échoué. Réessayez.",
  UNKNOWN_ERROR:
    "La vérification de sécurité n'a pas abouti. Réessayez dans un instant.",
}

export const CODES_REFUS_QUI_DEPENSENT_LE_JETON = [
  "MISSING_RESPONSE",
  "VERIFICATION_FAILED",
  "UNKNOWN_ERROR",
] as const satisfies readonly CodeRefusAuthentification[]

export type CodeRefusQuiDepenseLeJeton =
  (typeof CODES_REFUS_QUI_DEPENSENT_LE_JETON)[number]

const REFUS_QUI_DEPENSENT_LE_JETON = new Set<string>(
  CODES_REFUS_QUI_DEPENSENT_LE_JETON
)

export function estRefusQuiDepenseLeJeton(code: string | undefined): boolean {
  return code !== undefined && REFUS_QUI_DEPENSENT_LE_JETON.has(code)
}

const CODES = new Set<string>(CODES_REFUS_AUTHENTIFICATION)

export function estCodeRefusAuthentification(
  code: string | undefined
): code is CodeRefusAuthentification {
  return code !== undefined && CODES.has(code)
}

export function messageRefusAuthentification(code: string | undefined): string {
  return estCodeRefusAuthentification(code)
    ? MESSAGES_REFUS_AUTHENTIFICATION[code]
    : MESSAGE_REFUS_AUTHENTIFICATION_GENERIQUE
}

export function codeRefusDepuisStatut(
  statut: number | undefined
): CodeRefusAuthentification | undefined {
  return statut === 429 ? "TOO_MANY_ATTEMPTS" : undefined
}

export function refusDepuisErreurDeLaBibliotheque(erreur: {
  code?: string
  message?: string
  status?: number
}): { code?: string; message?: string } {
  const code = erreur.code ?? codeRefusDepuisStatut(erreur.status)
  return erreur.message === undefined
    ? { code }
    : { code, message: erreur.message }
}

export function estEmailNonVerifie(code: string | undefined): boolean {
  return code === "EMAIL_NOT_VERIFIED"
}

export function estIdentifiantsInvalides(code: string | undefined): boolean {
  return code === "INVALID_EMAIL_OR_PASSWORD"
}
