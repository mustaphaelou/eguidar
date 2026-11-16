import "server-only"

import { prisma } from "@/lib/db"
import { estRoleAdmin } from "@/lib/role"
import {
  SESSION_ABSOLUTE_ADMIN_SECONDS,
  SESSION_ABSOLUTE_CLIENT_SECONDS,
} from "@/lib/session-constants"

export interface SessionHorodatee {
  session: { createdAt: Date; token: string }
  user: { role: string }
}

function borneAbsolue(role: string): number {
  return estRoleAdmin(role)
    ? SESSION_ABSOLUTE_ADMIN_SECONDS
    : SESSION_ABSOLUTE_CLIENT_SECONDS
}

export function estHorsDureeAbsolue(
  session: SessionHorodatee,
  maintenant: number = Date.now()
): boolean {
  const age = maintenant - session.session.createdAt.getTime()
  return age >= borneAbsolue(session.user.role) * 1000
}

export async function revoquerSessionHorsDuree(
  session: SessionHorodatee
): Promise<boolean> {
  if (!estHorsDureeAbsolue(session)) return false

  await prisma.session.deleteMany({
    where: { token: session.session.token },
  })
  return true
}
