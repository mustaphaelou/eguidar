import { getResend } from "@/lib/email"

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
