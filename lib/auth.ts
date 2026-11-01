import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { emailOTP, haveIBeenPwned } from "better-auth/plugins"

import {
  ORDRE_ENTETES_ADRESSE_CLIENT,
  PROXIES_DE_CONFIANCE,
} from "@/lib/adresse-client"
import { prisma } from "@/lib/db"
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/longueur-mot-de-passe"
import { sendOtpEmail } from "@/lib/emails"
import {
  hotesDuTestDeSecurite,
  pluginTestDeSecurite,
} from "@/lib/test-de-securite"
import {
  SESSION_INACTIVE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/session-constants"
import { hooksEchecsConnexion } from "@/lib/echecs-connexion"

export const auth = betterAuth({
  appName: "Eguidar",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    ipAddress: {
      // L'ordre vit dans le résolveur partagé avec la Recherche : la
      // bibliothèque et le dépôt ne peuvent pas diverger.
      ipAddressHeaders: [...ORDRE_ENTETES_ADRESSE_CLIENT],
      trustedProxies: [...PROXIES_DE_CONFIANCE],
    },
  },
  account: {
    // Les jetons fournisseur sont chiffrés au repos avec une clé dérivée de
    // BETTER_AUTH_SECRET. Changer ce secret rend les jetons existants
    // illisibles : conséquence acceptée, rien dans la boutique ne les lit.
    encryptOAuthTokens: true,
  },
  hooks: hooksEchecsConnexion,
  session: {
    expiresIn: SESSION_INACTIVE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: LONGUEUR_MINIMALE_MOT_DE_PASSE,
    revokeSessionsOnPasswordReset: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // L'ensemble des scopes est déclaré en entier : la bibliothèque n'ajoute
      // aucun scope par défaut et une montée de version ne peut pas l'élargir
      // en silence.
      disableDefaultScope: true,
      scope: ["openid", "email", "profile"],
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
      disableDefaultScope: true,
      scope: ["email", "public_profile"],
      mapProfileToUser: () => ({ emailVerified: true }),
    },
  },
  plugins: [
    emailOTP({
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        await sendOtpEmail(email, otp, type)
      },
    }),
    // Le contrôle couvre l'Inscription et la réinitialisation du mot de passe ;
    // les routes de changement de mot de passe et d'administration restent hors
    // de cette phase (voir ADR-0043).
    haveIBeenPwned({
      paths: ["/sign-up/email", "/reset-password", "/email-otp/reset-password"],
    }),
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [
          pluginTestDeSecurite({
            secretKey: process.env.TURNSTILE_SECRET_KEY,
            allowedHostnames: hotesDuTestDeSecurite(),
          }),
        ]
      : []),
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
