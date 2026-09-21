import "server-only"

import { prisma } from "@/lib/db"

/**
 * Compte client tel que lu avant la promotion.
 *
 * Seul le drapeau de la Vérification de l'e-mail compte ici : un Compte
 * client non vérifié ne prouve pas que le mot de passe posé dessus appartient
 * au propriétaire de la boîte aux lettres.
 */
export interface CompteClientAvantPreuve {
  id: string
  emailVerified: boolean
}

/**
 * Compte lié (mot de passe ou Connexion sociale) rattaché au Compte client.
 */
export interface CompteLie {
  id: string
  providerId: string
}

/**
 * Port d'accès aux données du Compte client.
 *
 * Le helper ne connaît que ce port : les tests unitaires fournissent un double
 * en mémoire, le câblage de production fournit Prisma en direct (jamais
 * l'adaptateur, pour ne pas rejouer les hooks).
 */
export interface PortAccesCompteClient {
  trouverCompteClientParId(id: string): Promise<CompteClientAvantPreuve | null>
  listerComptesLies(userId: string): Promise<CompteLie[]>
  supprimerCompteLie(id: string): Promise<void>
  supprimerSessionsDuCompte(userId: string): Promise<void>
}

/**
 * Mise à jour entrante du Compte client (sous-ensemble du `user.update`).
 *
 * Seul `emailVerified` est lu : la garde étroite n'agit que lorsque la mise à
 * jour pose le drapeau à `true`.
 */
export interface PromotionVerificationEmail {
  emailVerified?: boolean | null
}

/**
 * Révoque l'accès non prouvé avant de valider l'adresse.
 *
 * Sémantique reprise du helper de la bibliothèque
 * (`db/revoke-unproven-account-access.mjs`, non exporté depuis la racine donc
 * réimplémenté côté app) : lorsque la Vérification de l'e-mail promeut un
 * Compte client actuellement non vérifié (le drapeau entrant passe à `true`
 * alors que la ligne stockée est encore à `false`), supprime ses comptes
 * `credential` puis toutes ses sessions.
 *
 * - Ligne déjà vérifiée (ou inconnue) : no-op strict.
 * - Mise à jour qui ne pose pas le drapeau vérifié : inchangée.
 * - Double promotion : converge, la seconde passe ne trouve rien à supprimer.
 *
 * @param acces Port d'accès aux données (mémoire en test, Prisma en prod).
 * @param compteClientId Identifiant du Compte client promu.
 * @param miseAJour Mise à jour entrante portant `emailVerified`.
 */
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

/**
 * Câblage de production : accès direct via Prisma.
 *
 * Suppressions directes (`account`, `session`), jamais via l'adaptateur, pour
 * ne pas redéclencher les hooks (pas de récursion) et ne pas dépendre de leur
 * ordre.
 */
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
