export const ECHEANCES_MAX_CONNEXIONS_ECHOUEES = 10

export const FENETRE_ECHEANCES_CONNEXION_MS = 15 * 60_000

export const CODE_COMPTE_TEMPORAIREMENT_VERROUILLE =
  "ACCOUNT_TEMPORARILY_LOCKED"

export const MESSAGE_COMPTE_TEMPORAIREMENT_VERROUILLE =
  "Trop de tentatives de connexion sur ce compte. Réessayez dans quelques minutes."

const PREFIXE_CLE = "eguidar:echecs-connexion:"

function adresseNormalisee(email: string): string {
  return email.trim().toLowerCase()
}

export function cleEchecsConnexion(email: string): string {
  return `${PREFIXE_CLE}${adresseNormalisee(email)}`
}
