import "server-only"

import { headers } from "next/headers"
import { cache } from "react"

import { auth } from "@/lib/auth"
import { estRoleAdmin, type Role } from "@/lib/role"
import { revoquerSessionHorsDuree } from "@/lib/session-expiration"

export type { Role }

export interface Client {
  id: string
  name: string
  email: string
  role: Role
}

export const lireSession = cache(async (): Promise<Client | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  if (await revoquerSessionHorsDuree(session)) return null

  const { id, name, email, role } = session.user
  return { id, name, email, role: estRoleAdmin(role) ? "admin" : "user" }
})

export function estAdmin(client: Client | null): client is Client {
  return client !== null && estRoleAdmin(client.role)
}
