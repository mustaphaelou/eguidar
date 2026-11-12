import { createHmac, timingSafeEqual } from "node:crypto"

import { TYPE_ENTITE_PAR_DECLENCHEUR } from "@/lib/automations/charge"
import type { FournisseurSocial } from "@/lib/oauth-providers"
import { prisma } from "@/lib/db"
import { invalidateCommande } from "@/lib/use-cases/cache-invalidation"

const FOURNISSEUR_FACEBOOK: FournisseurSocial = "facebook"

// Le type d'entité de la Commande vient du vocabulaire fermé des
// automatisations, celui-là même que l'écrivain d'Événements valide : le module
// de suppression ne fige pas ce littéral.
const ENTITE_COMMANDE = TYPE_ENTITE_PAR_DECLENCHEUR["commande.creee"]

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

export type ChargeSignedRequest = {
  user_id: string
}

/**
 * Vérifie un `signed_request` de Facebook : la signature HMAC-SHA256 du
 * `payload` encodé en base64url, comparée en temps constant avec le secret de
 * l'application. Rend la charge utile signée, ou `null` si le document est
 * malformé, mal signé ou d'un algorithme inconnu.
 */
export function verifierSignedRequest(
  signedRequest: string,
  secret: string
): ChargeSignedRequest | null {
  const parties = signedRequest.split(".")
  if (parties.length !== 2) return null

  const [signatureB64, chargeB64] = parties
  if (!BASE64URL.test(signatureB64) || !BASE64URL.test(chargeB64)) return null

  const signature = Buffer.from(signatureB64, "base64url")
  const signatureAttendue = createHmac("sha256", secret)
    .update(chargeB64)
    .digest()

  if (signature.length !== signatureAttendue.length) return null
  if (!timingSafeEqual(signature, signatureAttendue)) return null

  let charge: unknown
  try {
    charge = JSON.parse(Buffer.from(chargeB64, "base64url").toString("utf8"))
  } catch {
    return null
  }

  if (typeof charge !== "object" || charge === null) return null

  const { user_id, algorithm } = charge as Record<string, unknown>
  if (typeof user_id !== "string" || user_id === "") return null
  if (algorithm !== "HMAC-SHA256") return null

  return { user_id }
}

/**
 * Supprime le Compte client rattaché à l'identifiant applicatif Facebook, avec
 * ses Commandes et tout ce que la suppression du Compte client emporte
 * (comptes sociaux, sessions, Articles du panier, Brouillons d'Image produit).
 *
 * Un identifiant inconnu ne supprime rien : l'appel reste idempotent, comme
 * Meta l'exige quand il rejoue une demande de suppression.
 */
export async function supprimerDonneesFacebook(
  identifiantApplicatif: string
): Promise<void> {
  const commandes = await prisma.$transaction(async (tx) => {
    const comptes = await tx.account.findMany({
      where: {
        providerId: FOURNISSEUR_FACEBOOK,
        accountId: identifiantApplicatif,
      },
      select: { userId: true },
    })

    const identifiants = [...new Set(comptes.map((compte) => compte.userId))]
    if (identifiants.length === 0) return []

    const clients = await tx.user.findMany({
      where: { id: { in: identifiants } },
      select: { email: true },
    })

    const commandesSupprimees = await tx.order.findMany({
      where: { userId: { in: identifiants } },
      select: { id: true },
    })

    // Les Événements d'automatisation gardent une copie de la Commande — e-mail,
    // ville, adresse, téléphone, lignes du panier et totaux — sans clé étrangère
    // vers elle : ils ne partent pas avec la suppression. Ils partent dans la
    // même transaction, avant que les Commandes ne soient effacées. Les
    // Exécutions survivent : le schéma nullifie leur lien vers l'Événement.
    await tx.automationEvent.deleteMany({
      where: {
        entityType: ENTITE_COMMANDE,
        entityId: { in: commandesSupprimees.map(({ id }) => id) },
      },
    })

    // `Order.user` n'est pas en cascade : les Commandes partent avant le
    // Compte client, et `OrderItem` suit par cascade de sa Commande.
    await tx.order.deleteMany({
      where: { userId: { in: identifiants } },
    })

    // `verification` n'a pas de clé étrangère vers `user` : les codes encore en
    // attente pour les adresses du Client partent explicitement. Better Auth
    // écrit deux formes : `toOTPIdentifier` pour les codes — `${type}-otp-${email}`
    // — et `change-email-otp-${oldEmail}-${newEmail}` pour le changement
    // d'adresse. Le suffixe couvre la première, la contenance `-otp-${email}-`
    // la seconde quand l'adresse supprimée est l'ancienne ; aucune ne touche
    // l'identifiant d'une autre adresse dont celle-ci serait le suffixe. Le
    // changement d'adresse reste désactivé dans `lib/auth.ts`, mais la forme est
    // couverte pour que l'activer un jour ne laisse pas de lignes derrière.
    await tx.verification.deleteMany({
      where: {
        OR: clients.flatMap(({ email }) => [
          { identifier: { endsWith: `-otp-${email}` } },
          { identifier: { contains: `-otp-${email}-` } },
        ]),
      },
    })

    await tx.user.deleteMany({
      where: { id: { in: identifiants } },
    })

    return commandesSupprimees
  })

  // ADR-0014 : l'invalidation vit à côté de la suppression, après le commit.
  for (const commande of commandes) {
    invalidateCommande(commande.id)
  }
}
