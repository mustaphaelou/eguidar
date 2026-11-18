import { createAuthClient } from "better-auth/react"

import {
  emailOTPClient,
  lastLoginMethodClient,
} from "better-auth/client/plugins"

import { NOM_COOKIE_MOYEN_DE_CONNEXION } from "@/lib/moyen-de-connexion"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:3000",
  plugins: [
    emailOTPClient(),
    lastLoginMethodClient({ cookieName: NOM_COOKIE_MOYEN_DE_CONNEXION }),
  ],
})

export const { signIn, signUp, signOut, useSession } = authClient
