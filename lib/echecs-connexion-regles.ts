/**
 * Le seuil du compteur d'échecs par Compte client. NIST SP 800-63B-4 §3.2.2
 * demande de borner les échecs consécutifs sur un même compte ; dix laisse au
 * Client le droit à l'erreur sans donner au devineur un budget utile.
 */
export const ECHEANCES_MAX_CONNEXIONS_ECHOUEES = 10

/**
 * La fenêtre du compteur, courte à dessein : le verrou s'efface tout seul, donc
 * une attaque ciblée ne devient pas un déni de service permanent sur le compte.
 */
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
