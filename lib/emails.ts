import { getResend } from "@/lib/email"
import { OrderStatus } from "@/lib/generated/prisma/client"
import { ORDER_STATUS_LABELS, shortOrderId } from "@/lib/order-status"
import { formatPrice } from "@/lib/money"

const otpTypeLabels: Record<string, string> = {
  "email-verification": "la vérification de votre adresse e-mail",
  "sign-in": "la connexion à votre compte",
  "forget-password": "la réinitialisation de votre mot de passe",
  "change-email": "le changement de votre adresse e-mail",
}

export async function sendOtpEmail(email: string, otp: string, type: string): Promise<void> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY absent — OTP ${type} non envoyé à ${email} (code : ${otp})`)
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

export interface OrderEmailSnapshot {
  userEmail: string
  orderId: string
  items: OrderEmailItem[]
  total: number
  shippingFee: number
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

function orderDetailsHtml(snapshot: OrderEmailSnapshot): string {
  const rows = snapshot.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${escapeHtml(item.productName)} ${escapeHtml(item.variantName)} × ${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatPrice(item.price * item.quantity)}</td>
        </tr>`
    )
    .join("")
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${rows}
      <tr>
        <td style="padding: 8px 0;">Sous-total (TVA incluse)</td>
        <td style="padding: 8px 0; text-align: right; white-space: nowrap;">${formatPrice(snapshot.total)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0;">Livraison à ${escapeHtml(snapshot.cityName)}</td>
        <td style="padding: 8px 0; text-align: right; white-space: nowrap;">${formatPrice(snapshot.shippingFee)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Total à payer à la livraison</td>
        <td style="padding: 8px 0; text-align: right; font-weight: bold; white-space: nowrap;">${formatPrice(snapshot.total + snapshot.shippingFee)}</td>
      </tr>
    </table>
  `
}

async function sendOrderEmail(
  snapshot: OrderEmailSnapshot,
  subject: string,
  intro: string
): Promise<void> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY absent — e-mail de commande non envoyé à ${snapshot.userEmail}`)
    return
  }
  await resend.emails.send({
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

export async function sendOrderPlacedEmail(snapshot: OrderEmailSnapshot): Promise<void> {
  await sendOrderEmail(
    snapshot,
    `Commande ${shortOrderId(snapshot.orderId)} reçue — Eguidar`,
    "Merci pour votre commande ! Nous l'avons bien reçue."
  )
}

export async function sendOrderStatusEmail(
  snapshot: OrderEmailSnapshot,
  newStatus: OrderStatus
): Promise<void> {
  await sendOrderEmail(
    snapshot,
    `Votre commande ${shortOrderId(snapshot.orderId)} : ${ORDER_STATUS_LABELS[newStatus]} — Eguidar`,
    `Votre commande est maintenant : <strong>${ORDER_STATUS_LABELS[newStatus]}</strong>.`
  )
}
