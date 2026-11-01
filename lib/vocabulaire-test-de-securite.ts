/**
 * Le vocabulaire des *Envois protégés* : l'action réclamée au *Test de
 * sécurité* et la table qui associe un type de code à son envoi. Le serveur et
 * les surfaces client lisent la même table plutôt que de la redériver chacun
 * de leur côté.
 */
export const ACTIONS_TEST_DE_SECURITE = {
  inscription: "inscription",
  connexion: "connexion",
  code: "code",
  reinitialisation: "reinitialisation",
} as const

export type ActionTestDeSecurite =
  (typeof ACTIONS_TEST_DE_SECURITE)[keyof typeof ACTIONS_TEST_DE_SECURITE]

export const ACTIONS_PAR_TYPE_OTP = {
  "email-verification": "code",
  "forget-password": "reinitialisation",
} as const satisfies Record<string, ActionTestDeSecurite>

export type TypeOtp = keyof typeof ACTIONS_PAR_TYPE_OTP
