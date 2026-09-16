import "server-only"

import { headers } from "next/headers"

import { auth } from "@/lib/auth"

/**
 * Le rôle d'un Compte client, en union plutôt qu'en `string` : le schéma le
 * porte en texte libre (`prisma/schema.prisma`), la comparaison fautive ne
 * doit pas compiler.
 */
export type Role = "user" | "admin"

/**
 * Le Client de la requête courante : les faits d'identité que les surfaces
 * consomment, et son rôle. Déclaré ici, à côté de la lecture qui le produit,
 * au lieu d'être dérivé du type de retour d'une fonction.
 */
export interface Client {
  id: string
  name: string
  email: string
  role: Role
}

/**
 * La Session courante : la lecture unique de la session de la requête pour
 * un rendu ou une action serveur. Elle répond le Client, ou `null` — elle ne
 * refuse jamais.
 *
 * Le refus (la redirection vers le Lien de connexion) reste composé par la
 * surface qui l'exige, à partir de `loginUrl` : le header, lui, a besoin du
 * `null`, et un module qu'il importe ne doit pas posséder de politique de
 * redirection.
 *
 * Le rôle est ramené dans l'union : Better Auth le rend en `string`, et rien
 * hors de « admin » n'est administrateur — donc tout le reste est « user »,
 * exactement ce que le prédicat `estAdmin` décidait déjà.
 */
export async function lireSession(): Promise<Client | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const { id, name, email, role } = session.user
  return { id, name, email, role: role === "admin" ? "admin" : "user" }
}

/**
 * Le prédicat unique de l'Administration : ce Client est-il administrateur ?
 * Aucune surface n'écrit la comparaison de rôle elle-même.
 */
export function estAdmin(client: Client | null): client is Client {
  return client?.role === "admin"
}
