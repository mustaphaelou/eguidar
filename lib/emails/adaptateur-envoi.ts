import { getResend as getResendFournisseur } from "@/lib/email"

export interface ClientEmails {
  emails: {
    send(
      payload: {
        from: string
        to: string
        subject: string
        html: string
        text: string
      },
      options?: { idempotencyKey?: string }
    ): Promise<unknown>
  }
}

export interface EnvoiEmail {
  to: string
  sujet: string
  html: string
  texte: string
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
  await client.emails.send(
    {
      from: adresseExpedition(),
      to: envoi.to,
      subject: envoi.sujet,
      html: envoi.html,
      text: envoi.texte,
    },
    options
  )
}
