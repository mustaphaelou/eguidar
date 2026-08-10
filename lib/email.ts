import { Resend } from "resend"

const globalForResend = globalThis as unknown as { resend?: Resend }

export function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!globalForResend.resend) globalForResend.resend = new Resend(apiKey)
  return globalForResend.resend
}
