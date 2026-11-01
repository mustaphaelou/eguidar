import "server-only"

import { prisma } from "@/lib/db"
import {
  SESSION_ABSOLUTE_ADMIN_SECONDS,
  SESSION_ABSOLUTE_CLIENT_SECONDS,
} from "@/lib/session-constants"

export interface SessionHorodatee {
  session: { createdAt: Date; token: string }
  user: { role: string }
}

function borneAbsolue(role: string): number {
  return role === "admin"
    ? SESSION_ABSOLUTE_ADMIN_SECONDS
    : SESSION_ABSOLUTE_CLIENT_SECONDS
}

/**
 * L'âge se mesure depuis `createdAt`, que l'activité ne repousse pas, et non
 * depuis `expiresAt`, que `updateAge` fait glisser.
 */
export function estHorsDureeAbsolue(
  session: SessionHorodatee,
  maintenant: number = Date.now()
): boolean {
  const age = maintenant - session.session.createdAt.getTime()
  return age >= borneAbsolue(session.user.role) * 1000
}

/**
 * Supprime la ligne de session une fois la borne atteinte, pour que le cookie
 * ne soit pas seulement masqué par la lecture : les endpoints d'authentification
 * ne trouvent plus de session et la réponse redevient celle d'un Visiteur. La
 * lecture et le gestionnaire `/api/auth/*` partagent ce geste.
 */
export async function revoquerSessionHorsDuree(
  session: SessionHorodatee
): Promise<boolean> {
  if (!estHorsDureeAbsolue(session)) return false

  await prisma.session.deleteMany({
    where: { token: session.session.token },
  })
  return true
}
