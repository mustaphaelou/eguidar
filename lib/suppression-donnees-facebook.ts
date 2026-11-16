import { createHmac, timingSafeEqual } from "node:crypto"

import { TYPE_ENTITE_PAR_DECLENCHEUR } from "@/lib/automations/charge"
import type { FournisseurSocial } from "@/lib/oauth-providers"
import { prisma } from "@/lib/db"
import { invalidateCommande } from "@/lib/use-cases/cache-invalidation"

const FOURNISSEUR_FACEBOOK: FournisseurSocial = "facebook"

const ENTITE_COMMANDE = TYPE_ENTITE_PAR_DECLENCHEUR["commande.creee"]

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

export type ChargeSignedRequest = {
  user_id: string
}

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

    await tx.order.deleteMany({
      where: { userId: { in: identifiants } },
    })

    await tx.automationEvent.deleteMany({
      where: {
        entityType: ENTITE_COMMANDE,
        entityId: { in: commandesSupprimees.map(({ id }) => id) },
      },
    })

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

  for (const commande of commandes) {
    invalidateCommande(commande.id)
  }
}
