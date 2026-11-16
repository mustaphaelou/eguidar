import { authClient } from "@/lib/client"

import { codeRefusDepuisStatut } from "@/lib/refus-authentification"
import type {
  PortAuthentification,
  RefusAuthentification,
} from "./port-authentification"

type ErreurDeLaBibliotheque = {
  code?: string
  status?: number
}

function refusDepuisLaBibliotheque(
  erreur: ErreurDeLaBibliotheque | null
): RefusAuthentification | null {
  if (!erreur) return null
  return { code: erreur.code ?? codeRefusDepuisStatut(erreur.status) }
}

export const portAuthentificationClient: PortAuthentification = {
  async connexionParMotDePasse({ email, motDePasse, entetes }) {
    const resultat = await authClient.signIn.email({
      email,
      password: motDePasse,
      fetchOptions: { headers: entetes },
    })
    return { error: refusDepuisLaBibliotheque(resultat.error) }
  },

  async inscription({ nom, email, motDePasse, entetes }) {
    const resultat = await authClient.signUp.email({
      name: nom,
      email,
      password: motDePasse,
      fetchOptions: { headers: entetes },
    })
    return { error: refusDepuisLaBibliotheque(resultat.error) }
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
    return { error: refusDepuisLaBibliotheque(resultat.error) }
  },

  async envoyerCode({ email, type, entetes }) {
    const resultat = await authClient.emailOtp.sendVerificationOtp({
      email,
      type,
      fetchOptions: { headers: entetes },
    })
    return { error: refusDepuisLaBibliotheque(resultat.error) }
  },

  async verifierCode({ email, code }) {
    const resultat = await authClient.emailOtp.verifyEmail({ email, otp: code })
    return { error: refusDepuisLaBibliotheque(resultat.error) }
  },
}
