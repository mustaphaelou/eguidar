/**
 * Les points d'entrée de la connexion après lesquels le Panier Visiteur est
 * rejoué. La liste est la règle : un nouveau chemin s'ajoute ici, et la route
 * d'authentification n'a pas à connaître les siens. Les chemins sont ceux que
 * la route reçoit, préfixe `/api/auth` compris.
 *
 * La Vérification de l'e-mail n'ouvre une session que si la bibliothèque est
 * configurée pour connecter après vérification ; l'entrée est déclarée pour que
 * la règle suive le chemin le jour où une session existe.
 */
export type PointEntreeConnexion = {
  methode: "GET" | "POST"
  chemin: string
  prefixe?: boolean
}

export const POINTS_ENTREE_CONNEXION: readonly PointEntreeConnexion[] = [
  { methode: "POST", chemin: "/api/auth/sign-in/email" },
  { methode: "GET", chemin: "/api/auth/callback/", prefixe: true },
  { methode: "POST", chemin: "/api/auth/sign-in/email-otp" },
  { methode: "POST", chemin: "/api/auth/email-otp/verify-email" },
]

export function estPointEntreeConnexion(
  methode: string,
  chemin: string
): boolean {
  return POINTS_ENTREE_CONNEXION.some((point) => {
    if (point.methode !== methode) return false
    return point.prefixe
      ? chemin.startsWith(point.chemin)
      : chemin === point.chemin
  })
}
