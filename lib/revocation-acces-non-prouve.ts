import "server-only"

import { prisma } from "@/lib/db"

export interface CompteClientAvantPreuve {
  id: string
  emailVerified: boolean
}

export interface CompteLie {
  id: string
  providerId: string
}

export interface PortAccesCompteClient {
  trouverCompteClientParId(id: string): Promise<CompteClientAvantPreuve | null>
  listerComptesLies(userId: string): Promise<CompteLie[]>
  supprimerCompteLie(id: string): Promise<void>
  supprimerSessionsDuCompte(userId: string): Promise<void>
}

export interface PromotionVerificationEmail {
  emailVerified?: boolean | null
}

export async function revoquerAccesNonProuve(
  acces: PortAccesCompteClient,
  compteClientId: string,
  miseAJour: PromotionVerificationEmail
): Promise<void> {
  if (miseAJour.emailVerified !== true) return

  const compte = await acces.trouverCompteClientParId(compteClientId)
  if (!compte || compte.emailVerified) return

  const comptesLies = await acces.listerComptesLies(compteClientId)
  for (const compteLie of comptesLies) {
    if (compteLie.providerId === "credential") {
      await acces.supprimerCompteLie(compteLie.id)
    }
  }
  await acces.supprimerSessionsDuCompte(compteClientId)
}

export const accesCompteClientPrisma: PortAccesCompteClient = {
  async trouverCompteClientParId(id) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, emailVerified: true },
    })
  },

  async listerComptesLies(userId) {
    return prisma.account.findMany({
      where: { userId },
      select: { id: true, providerId: true },
    })
  },

  async supprimerCompteLie(id) {
    await prisma.account.delete({ where: { id } })
  },

  async supprimerSessionsDuCompte(userId) {
    await prisma.session.deleteMany({ where: { userId } })
  },
}
