import { getResend } from "@/lib/email"
import { OrderStatus } from "@/lib/generated/prisma/client"
import { ORDER_STATUS_LABELS } from "@/lib/statut-de-commande"
import { formatPrice } from "@/lib/money"
import { récapitulatifRowsFromCommande } from "@/lib/recapitulatif-paiement"
import { shortOrderId } from "@/lib/utils"

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
  const resend = getResend()
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY absent — code de vérification non envoyé à ${email}`
    )
    return
  }
  const label = otpTypeLabels[type] ?? "l'utilisation de votre compte"
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Eguidar <onboarding@resend.dev>",
    to: email,
    subject: "Votre code de vérification Eguidar",
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

export interface OrderEmailItem {
  productName: string
  variantName: string
  quantity: number
  price: number
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

/**
 * Le sous-ensemble du client Resend dont l'envoi de Commande a besoin : il
 * permet de prouver la clé d'idempotence sur un double sans mocker le module.
 */
export interface ClientEmails {
  emails: {
    send(
      payload: {
        from: string
        to: string
        subject: string
        html: string
      },
      options?: { idempotencyKey?: string }
    ): Promise<unknown>
  }
}

export interface OrderEmailSnapshot {
  userEmail: string
  orderId: string
  items: OrderEmailItem[]
  total: number
  shippingFee: number
  totalPayable: number
  cityName: string
  address: string
  phone: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function orderDetailsHtml(snapshot: OrderEmailSnapshot): string {
  const itemRows = snapshot.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${escapeHtml(item.productName)} ${escapeHtml(item.variantName)} × ${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatPrice(item.price * item.quantity)}</td>
        </tr>`
    )
    .join("")

  const recapRows = récapitulatifRowsFromCommande(snapshot)

  const summaryRows = recapRows
    .map((row) => {
      const bold = row.kind === "total" ? " font-weight: bold;" : ""
      return `
      <tr>
        <td style="padding: 8px 0;${bold}">${escapeHtml(row.label)}</td>
        <td style="padding: 8px 0; text-align: right;${bold} white-space: nowrap;">${escapeHtml(row.value)}</td>
      </tr>`
    })
    .join("")

  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${itemRows}
      ${summaryRows}
    </table>
  `
}

async function sendOrderEmail(
  snapshot: OrderEmailSnapshot,
  subject: string,
  intro: string,
  cleIdempotence: string,
  client: ClientEmails | null
): Promise<void> {
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY absent — e-mail de commande non envoyé à ${snapshot.userEmail}`
    )
    return
  }
  await client.emails.send({
    from: process.env.EMAIL_FROM ?? "Eguidar <onboarding@resend.dev>",
    to: snapshot.userEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Eguidar</h2>
        <p>${intro}</p>
        <p>Commande ${shortOrderId(snapshot.orderId)}</p>
        ${orderDetailsHtml(snapshot)}
        <p>Livraison : ${escapeHtml(snapshot.address)}, ${escapeHtml(snapshot.cityName)} — ${escapeHtml(snapshot.phone)}</p>
        <p>Réglez en espèces au livreur lors de la réception de votre colis.</p>
        <p>— L'équipe Eguidar</p>
      </div>
    `,
  })
}

export async function sendOrderPlacedEmail(
  snapshot: OrderEmailSnapshot,
  cleIdempotence = cleIdempotenceEmailPlacee(snapshot.orderId),
  client: ClientEmails | null = getResend()
): Promise<void> {
  await sendOrderEmail(
    snapshot,
    `Commande ${shortOrderId(snapshot.orderId)} reçue — Eguidar`,
    "Merci pour votre commande ! Nous l'avons bien reçue.",
    cleIdempotence,
    client
  )
}

export async function sendOrderStatusEmail(
  snapshot: OrderEmailSnapshot,
  newStatus: OrderStatus,
  cleIdempotence = cleIdempotenceEmailStatut(snapshot.orderId, newStatus),
  client: ClientEmails | null = getResend()
): Promise<void> {
  await sendOrderEmail(
    snapshot,
    `Votre commande ${shortOrderId(snapshot.orderId)} : ${ORDER_STATUS_LABELS[newStatus]} — Eguidar`,
    `Votre commande est maintenant : <strong>${ORDER_STATUS_LABELS[newStatus]}</strong>.`,
    cleIdempotence,
    client
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
  await client.emails.send(
    {
      from: process.env.EMAIL_FROM ?? "Eguidar <onboarding@resend.dev>",
      to: entree.destinataire,
      subject: entree.sujet,
      html: `<pre style="font-family: ui-monospace, monospace; white-space: pre-wrap;">${escapeHtml(entree.texte)}</pre>`,
    },
    { idempotencyKey: entree.cleIdempotence }
  )
}
