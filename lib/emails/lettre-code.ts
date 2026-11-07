import {
  DUREE_VIE_CODE_SECONDS,
  libelleDureeCode,
} from "@/lib/emails/duree-code"
import { rendreLettre, type Bloc } from "@/lib/emails/gabarit"
import type { MessageEmail } from "@/lib/emails/message"
import { lignesPiedTexte } from "@/lib/emails/pied"
import { site } from "@/lib/site"

export interface FaitsCode {
  code: string
  type: string
}

const LIBELLÉS_PAR_TYPE: Record<string, string> = {
  "email-verification": "la vérification de votre adresse e-mail",
  "sign-in": "la connexion à votre compte",
  "forget-password": "la réinitialisation de votre mot de passe",
  "change-email": "le changement de votre adresse e-mail",
}

const LIBELLÉ_PAR_DÉFAUT = "l'utilisation de votre compte"

const SUJET = "Votre code de vérification Eguidar"

function libelléDuType(type: string): string {
  return LIBELLÉS_PAR_TYPE[type] ?? LIBELLÉ_PAR_DÉFAUT
}

function phraseExpiration(): string {
  return `Ce code expire dans ${libelleDureeCode(DUREE_VIE_CODE_SECONDS)}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`
}

export function messageCode({ code, type }: FaitsCode): MessageEmail {
  const libellé = libelléDuType(type)
  const expiration = phraseExpiration()
  const blocs: Bloc[] = [
    { type: "titre", texte: "Code de vérification" },
    { type: "paragraphe", texte: `Votre code pour ${libellé} est :` },
    { type: "code", code },
    { type: "paragraphe", texte: expiration },
  ]

  const sections = [
    [site.legalName],
    ["Code de vérification"],
    [`Votre code pour ${libellé} est :`],
    [code],
    [expiration],
    lignesPiedTexte(),
  ]
    .filter((section) => section.length > 0)
    .map((section) => section.join("\n"))

  return {
    sujet: SUJET,
    html: rendreLettre({
      préEnTête: `Votre code de vérification Eguidar est ${code}.`,
      blocs,
    }),
    texte: sections.join("\n\n"),
  }
}
