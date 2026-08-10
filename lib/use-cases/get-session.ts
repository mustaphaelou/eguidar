import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export async function requireSessionUser(nextPath: string) {
  const user = await getSessionUser()
  if (!user) redirect(`/connexion?next=${encodeURIComponent(nextPath)}`)
  return user
}
