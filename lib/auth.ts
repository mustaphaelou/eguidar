import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { captcha, emailOTP } from "better-auth/plugins"

import { prisma } from "@/lib/db"
import { sendOtpEmail } from "@/lib/emails"
import {
  accesCompteClientPrisma,
  revoquerAccesNonProuve,
} from "@/lib/revocation-acces-non-prouve"
import {
  SESSION_INACTIVE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/session-constants"

export const auth = betterAuth({
  appName: "Eguidar",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
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
    minPasswordLength: 8,
  },
  /**
   * Un Compte client dont l'e-mail n'est pas vérifié ne prouve pas que le mot
   * de passe posé dessus appartient au propriétaire de la boîte. La bibliothèque
   * promeut la ligne *sans* rien révoquer — `/email-otp/verify-email` ne pose
   * `emailVerified: true` que sur la ligne trouvée par e-mail — donc c'est ici,
   * avant la promotion, que l'accès non prouvé disparaît.
   *
   * La couture est `beforeEmailVerification` et non `databaseHooks` : le hook de
   * mise à jour reçoit la charge utile mais jamais l'identifiant de la ligne
   * visée (`with-hooks.mjs` transmet le `where` à l'adaptateur, pas au hook), et
   * la règle porte sur un Compte client précis. Ce hook est appelé par les trois
   * routes de promotion de la bibliothèque, toutes avant leur mise à jour.
   *
   * `{ emailVerified: true }` décrit la promotion que ce point d'entrée annonce,
   * pas une copie de la charge utile : la route ne la passe pas.
   */
  emailVerification: {
    beforeEmailVerification: async (compteClient) => {
      await revoquerAccesNonProuve(accesCompteClientPrisma, compteClient.id, {
        emailVerified: true,
      })
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
      mapProfileToUser: () => ({ emailVerified: true }),
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        await sendOtpEmail(email, otp, type)
      },
    }),
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY,
            endpoints: [
              "/sign-up/email",
              "/sign-in/email",
              "/request-password-reset",
              "/email-otp/send-verification-otp",
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
