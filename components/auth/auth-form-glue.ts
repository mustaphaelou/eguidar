"use client"

import type { RefusAuthentification } from "@/components/auth/port-authentification"
import {
  estRefusQuiDepenseLeJeton,
  messageRefusAuthentification,
} from "@/lib/refus-authentification"

export const MESSAGE_SERVEUR_INJOIGNABLE =
  "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."

export function translateAuthError(error: RefusAuthentification): string {
  return messageRefusAuthentification(error.code)
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
  if (estRefusQuiDepenseLeJeton(error?.code)) reset()
  return translateAuthError(error ?? {})
}
