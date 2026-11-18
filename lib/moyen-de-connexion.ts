export type MoyenDeConnexion = "mot-de-passe" | "google" | "facebook"

export const NOM_COOKIE_MOYEN_DE_CONNEXION =
  "eguidar.dernier-moyen-de-connexion"

export const DUREE_VIE_COOKIE_MOYEN_DE_CONNEXION_SECONDES = 30 * 24 * 60 * 60

const LIBELLES: Record<MoyenDeConnexion, string> = {
  "mot-de-passe": "e-mail et mot de passe",
  google: "Google",
  facebook: "Facebook",
}

const CHEMINS: Record<string, MoyenDeConnexion> = {
  "/sign-in/email": "mot-de-passe",
  "/callback/google": "google",
  "/callback/facebook": "facebook",
}

export function resoudreMoyenDeConnexion(
  chemin: string
): MoyenDeConnexion | "" {
  return CHEMINS[chemin] ?? ""
}

export function analyserValeurMoyenDeConnexion(
  valeur: string | null | undefined
): MoyenDeConnexion | null {
  if (
    valeur === "mot-de-passe" ||
    valeur === "google" ||
    valeur === "facebook"
  ) {
    return valeur
  }
  return null
}

export function moyensDeConnexionOfferts({
  hasGoogle,
  hasFacebook,
}: {
  hasGoogle: boolean
  hasFacebook: boolean
}): readonly MoyenDeConnexion[] {
  const offerts: MoyenDeConnexion[] = ["mot-de-passe"]
  if (hasGoogle) offerts.push("google")
  if (hasFacebook) offerts.push("facebook")
  return offerts
}

export function moyenDeConnexionAffichable(
  valeur: string | null | undefined,
  offerts: readonly MoyenDeConnexion[]
): MoyenDeConnexion | null {
  const moyen = analyserValeurMoyenDeConnexion(valeur)
  if (moyen === null || offerts.length < 2 || !offerts.includes(moyen)) {
    return null
  }
  return moyen
}

export function phraseDerniereConnexion(moyen: MoyenDeConnexion): string {
  return `Dernière connexion sur cet appareil : ${LIBELLES[moyen]}.`
}
