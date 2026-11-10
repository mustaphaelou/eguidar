import type { FournisseurSocial } from "@/lib/oauth-providers"
import type { TypeOtp } from "@/lib/vocabulaire-test-de-securite"

/**
 * Le refus traverse le port dans sa forme actuelle — `code` et `message`.
 * La traduction en copie reste au flux, qui la porte.
 */
export interface RefusAuthentification {
  code?: string
  message?: string
}

export interface ResultatAuthentification {
  error: RefusAuthentification | null
}

export interface EntreeConnexionParMotDePasse {
  email: string
  motDePasse: string
  entetes?: HeadersInit
}

export interface EntreeInscription {
  nom: string
  email: string
  motDePasse: string
  entetes?: HeadersInit
}

export interface EntreeConnexionSociale {
  fournisseur: FournisseurSocial
  adresseDeRetour: string
  adresseDeRetourEnEchec: string
}

export interface EntreeEnvoiCode {
  email: string
  type: TypeOtp
  entetes?: HeadersInit
}

export interface EntreeVerificationCode {
  email: string
  code: string
}

export interface PortAuthentification {
  connexionParMotDePasse(
    entree: EntreeConnexionParMotDePasse
  ): Promise<ResultatAuthentification>
  inscription(entree: EntreeInscription): Promise<ResultatAuthentification>
  connexionSociale(
    entree: EntreeConnexionSociale
  ): Promise<ResultatAuthentification>
  envoyerCode(entree: EntreeEnvoiCode): Promise<ResultatAuthentification>
  verifierCode(
    entree: EntreeVerificationCode
  ): Promise<ResultatAuthentification>
}
