import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { revokeUnprovenAccountAccess } from "better-auth/db"
import { nextCookies } from "better-auth/next-js"
import { emailOTP, haveIBeenPwned, lastLoginMethod } from "better-auth/plugins"

import {
  ORDRE_ENTETES_ADRESSE_CLIENT,
  PROXIES_DE_CONFIANCE,
} from "@/lib/adresse-client"
import { prisma } from "@/lib/db"
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/longueur-mot-de-passe"
import { hacherMotDePasse } from "@/lib/mot-de-passe-hache"
import { verifierMotDePasseEtRehacher } from "@/lib/rehachage-mot-de-passe"
import { sendOtpEmail } from "@/lib/emails"
import { DUREE_VIE_CODE_SECONDS } from "@/lib/emails/duree-code"
import {
  ORIGINES_DE_LA_BOUTIQUE,
  originesSupplementaires,
} from "@/lib/origines-de-confiance"
import {
  hotesDuTestDeSecurite,
  pluginTestDeSecurite,
} from "@/lib/test-de-securite"
import {
  SESSION_INACTIVE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/session-constants"
import { hooksEchecsConnexion } from "@/lib/echecs-connexion"
import { pluginConnexionApresReset } from "@/lib/connexion-apres-reset"
import {
  DUREE_VIE_COOKIE_MOYEN_DE_CONNEXION_SECONDES,
  NOM_COOKIE_MOYEN_DE_CONNEXION,
  resoudreMoyenDeConnexion,
} from "@/lib/moyen-de-connexion"

export const auth = betterAuth({
  appName: "Eguidar",
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [...ORIGINES_DE_LA_BOUTIQUE, ...originesSupplementaires()],
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    ipAddress: {
      ipAddressHeaders: [...ORDRE_ENTETES_ADRESSE_CLIENT],
      trustedProxies: [...PROXIES_DE_CONFIANCE],
    },
  },
  account: {
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
  emailVerification: {
    autoSignInAfterVerification: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: LONGUEUR_MINIMALE_MOT_DE_PASSE,
    revokeSessionsOnPasswordReset: true,
    onExistingUserSignUp: async ({ user }) => {
      if (user.emailVerified) return
      const contexte = await auth.$context
      await revokeUnprovenAccountAccess(
        { context: contexte } as Parameters<
          typeof revokeUnprovenAccountAccess
        >[0],
        user.id
      )
    },
    password: {
      hash: hacherMotDePasse,
      verify: verifierMotDePasseEtRehacher,
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
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
      expiresIn: DUREE_VIE_CODE_SECONDS,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        await sendOtpEmail(email, otp, type)
      },
    }),
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
    pluginConnexionApresReset,
    lastLoginMethod({
      storeInDatabase: false,
      cookieName: NOM_COOKIE_MOYEN_DE_CONNEXION,
      maxAge: DUREE_VIE_COOKIE_MOYEN_DE_CONNEXION_SECONDES,
      customResolveMethod: (ctx) => resoudreMoyenDeConnexion(ctx.path ?? ""),
    }),
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
