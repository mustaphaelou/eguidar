export type FournisseurSocial = "facebook" | "google"

export const hasGoogleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID)

export const hasFacebookOAuth = Boolean(process.env.FACEBOOK_CLIENT_ID)
