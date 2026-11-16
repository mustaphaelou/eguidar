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
