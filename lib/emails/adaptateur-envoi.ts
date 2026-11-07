import { getResend as getResendFournisseur } from "@/lib/email"

export interface ClientEmails {
  emails: {
    send(
      payload: {
        from: string
        to: string
        subject: string
        html: string
        text?: string
      },
      options?: { idempotencyKey?: string }
    ): Promise<unknown>
  }
}

export interface EnvoiEmail {
  to: string
  sujet: string
  html: string
  texte?: string
  cleIdempotence?: string
}

export function getResend(): ClientEmails | null {
  return getResendFournisseur()
}

function adresseExpedition(): string {
  return process.env.EMAIL_FROM ?? "Eguidar <onboarding@resend.dev>"
}

export async function envoyer(
  client: ClientEmails,
  envoi: EnvoiEmail
): Promise<void> {
  const options =
    envoi.cleIdempotence === undefined
      ? undefined
      : { idempotencyKey: envoi.cleIdempotence }
  const charge: {
    from: string
    to: string
    subject: string
    html: string
    text?: string
  } = {
    from: adresseExpedition(),
    to: envoi.to,
    subject: envoi.sujet,
    html: envoi.html,
  }
  if (envoi.texte !== undefined) {
    charge.text = envoi.texte
  }
  await client.emails.send(charge, options)
}
