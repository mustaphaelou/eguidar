import type { OrderEmailSnapshot as ChargeOrderEmailSnapshot } from "@/lib/automations/charge"
import {
  envoyer,
  getResend,
  type ClientEmails,
} from "@/lib/emails/adaptateur-envoi"
import { html as fragment } from "@/lib/emails/gabarit"
import { messageCode } from "@/lib/emails/lettre-code"
import {
  messageCommandePlacee,
  messageCommandeStatut,
} from "@/lib/emails/lettres-commande"
import { type OrderStatus } from "@/lib/statut-de-commande"

export type OrderEmailSnapshot = ChargeOrderEmailSnapshot

export async function sendOtpEmail(
  email: string,
  otp: string,
  type: string
): Promise<void> {
  const client = getResend()
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY absent — code de vérification non envoyé à ${email}`
    )
    return
  }
  const message = messageCode({ code: otp, type })
  await envoyer(client, {
    to: email,
    sujet: message.sujet,
    html: message.html,
    texte: message.texte,
  })
}

/**
 * La clé d'idempotence du fournisseur (ADR-0044) : la même Commande et le même
 * fait donnent la même clé, que l'e-mail parte tout de suite après le commit
 * ou qu'un travailleur le rejoue. Resend la mémorise 24 h — c'est la durée de
 * vie d'un événement.
 */
export function cleIdempotenceEmailPlacee(orderId: string): string {
  return `commande.creee/${orderId}/1`
}

export function cleIdempotenceEmailStatut(
  orderId: string,
  newStatus: OrderStatus
): string {
  return `commande.statut/${orderId}/${newStatus}`
}

async function envoyerMessage(
  client: ClientEmails,
  snapshot: OrderEmailSnapshot,
  message: { sujet: string; html: string; texte: string },
  cleIdempotence: string
): Promise<void> {
  await envoyer(client, {
    to: snapshot.userEmail,
    sujet: message.sujet,
    html: message.html,
    texte: message.texte,
    cleIdempotence,
  })
}

export async function sendOrderPlacedEmail(
  snapshot: OrderEmailSnapshot,
  cleIdempotence = cleIdempotenceEmailPlacee(snapshot.orderId),
  client: ClientEmails | null = getResend()
): Promise<void> {
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY absent — e-mail de commande non envoyé à ${snapshot.userEmail}`
    )
    return
  }
  await envoyerMessage(
    client,
    snapshot,
    messageCommandePlacee(snapshot),
    cleIdempotence
  )
}

export async function sendOrderStatusEmail(
  snapshot: OrderEmailSnapshot,
  newStatus: OrderStatus,
  cleIdempotence = cleIdempotenceEmailStatut(snapshot.orderId, newStatus),
  client: ClientEmails | null = getResend()
): Promise<void> {
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY absent — e-mail de commande non envoyé à ${snapshot.userEmail}`
    )
    return
  }
  await envoyerMessage(
    client,
    snapshot,
    messageCommandeStatut(snapshot, newStatus),
    cleIdempotence
  )
}

export interface EntreeDigestEmail {
  destinataire: string
  sujet: string
  texte: string
  cleIdempotence: string
}

export async function sendDigestEmail(
  entree: EntreeDigestEmail,
  client: ClientEmails | null = getResend()
): Promise<void> {
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY absent — digest non envoyé à ${entree.destinataire}`
    )
    return
  }
  await envoyer(client, {
    to: entree.destinataire,
    sujet: entree.sujet,
    html: fragment`<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap;">${entree.texte}</pre>`
      .html,
    cleIdempotence: entree.cleIdempotence,
  })
}
