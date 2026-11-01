import "server-only"

import { headers } from "next/headers"
import { cache } from "react"

import { auth } from "@/lib/auth"
import { revoquerSessionHorsDuree } from "@/lib/session-expiration"

export type Role = "user" | "admin"

export interface Client {
  id: string
  name: string
  email: string
  role: Role
}

export const lireSession = cache(async (): Promise<Client | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  // La lecture est le seul propriétaire de la session : atteindre la borne
  // absolue la termine, et supprime la ligne pour que le cookie ne survive pas
  // aux endpoints d'authentification.
  if (await revoquerSessionHorsDuree(session)) return null

  const { id, name, email, role } = session.user
  return { id, name, email, role: role === "admin" ? "admin" : "user" }
})

export function estAdmin(client: Client | null): client is Client {
  return client?.role === "admin"
}
