import type { OrderEmailSnapshot as ChargeOrderEmailSnapshot } from "@/lib/automations/charge"
import {
  envoyer,
  getResend,
  type ClientEmails,
} from "@/lib/emails/adaptateur-envoi"
import { html as fragment } from "@/lib/emails/gabarit"
import {
  messageCommandePlacee,
  messageCommandeStatut,
} from "@/lib/emails/lettres-commande"
import { type OrderStatus } from "@/lib/statut-de-commande"

export type OrderEmailSnapshot = ChargeOrderEmailSnapshot

const otpTypeLabels: Record<string, string> = {
  "email-verification": "la vérification de votre adresse e-mail",
  "sign-in": "la connexion à votre compte",
  "forget-password": "la réinitialisation de votre mot de passe",
  "change-email": "le changement de votre adresse e-mail",
}

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
  const label = otpTypeLabels[type] ?? "l'utilisation de votre compte"
  await envoyer(client, {
    to: email,
    sujet: "Votre code de vérification Eguidar",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Code de vérification</h2>
        <p>Bonjour,</p>
        <p>Votre code pour ${label} est :</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center;">${otp}</p>
        <p>Ce code expire dans 5 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
        <p>— L'équipe Eguidar</p>
      </div>
    `,
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
