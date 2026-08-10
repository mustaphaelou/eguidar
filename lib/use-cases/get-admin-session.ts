import "server-only"

import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { isAdminRole } from "@/lib/use-cases/admin-gate"

export async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || !isAdminRole(session.user)) return null
  return session
}
