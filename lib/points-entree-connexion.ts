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
