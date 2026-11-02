/**
 * Le vocabulaire du rôle, neutre : le module de la durée absolue d'une session
 * teste le rôle sans importer la Session courante ni recopier la chaîne
 * `"admin"`. `Client` et `estAdmin` restent dans
 * `lib/use-cases/session-courante.ts` (ADR-0024).
 */
export type Role = "user" | "admin"

export function estRoleAdmin(role: string): boolean {
  return role === "admin"
}
