import "server-only"

import { headers } from "next/headers"

import { auth } from "@/lib/auth"

export type Role = "user" | "admin"

export interface Client {
  id: string
  name: string
  email: string
  role: Role
}

export async function lireSession(): Promise<Client | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const { id, name, email, role } = session.user
  return { id, name, email, role: role === "admin" ? "admin" : "user" }
}

export function estAdmin(client: Client | null): client is Client {
  return client?.role === "admin"
}
