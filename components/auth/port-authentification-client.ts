import { authClient } from "@/lib/client"

import type { PortAuthentification } from "./port-authentification"

/**
 * L'adaptateur par défaut du port : les cinq opérations composées sur le
 * client d'authentification réel. Aucun appelant de production ne remplace
 * cette instance ; un test lui préfère un adaptateur en mémoire.
 */
export const portAuthentificationClient: PortAuthentification = {
  async connexionParMotDePasse({ email, motDePasse, entetes }) {
    const resultat = await authClient.signIn.email({
      email,
      password: motDePasse,
      fetchOptions: { headers: entetes },
    })
    return { error: resultat.error ?? null }
  },

  async inscription({ nom, email, motDePasse, entetes }) {
    const resultat = await authClient.signUp.email({
      name: nom,
      email,
      password: motDePasse,
      fetchOptions: { headers: entetes },
    })
    return { error: resultat.error ?? null }
  },

  async connexionSociale({
    fournisseur,
    adresseDeRetour,
    adresseDeRetourEnEchec,
  }) {
    const resultat = await authClient.signIn.social({
      provider: fournisseur,
      callbackURL: adresseDeRetour,
      errorCallbackURL: adresseDeRetourEnEchec,
    })
    return { error: resultat.error ?? null }
  },

  async envoyerCode({ email, type, entetes }) {
    const resultat = await authClient.emailOtp.sendVerificationOtp({
      email,
      type,
      fetchOptions: { headers: entetes },
    })
    return { error: resultat.error ?? null }
  },

  async verifierCode({ email, code }) {
    const resultat = await authClient.emailOtp.verifyEmail({ email, otp: code })
    return { error: resultat.error ?? null }
  },
}
