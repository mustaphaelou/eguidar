"use client"

import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Turnstile } from "@/components/auth/turnstile"
import { authClient } from "@/lib/client"

const captchaHeaders = (token: string | null) =>
  token ? { "x-captcha-response": token } : undefined

const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

export type SignUpStep = "form" | "otp"

export function SignUpForm({
  initialEmail,
  onStepChange,
  onVerified,
}: {
  initialEmail?: string
  onStepChange?: (step: SignUpStep, email: string) => void
  onVerified?: (email: string) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState(initialEmail ?? "")
  const [password, setPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [otpCaptchaToken, setOtpCaptchaToken] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<SignUpStep>("form")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    onStepChange?.(step, email)
  }, [onStepChange, step, email])

  const handleCaptchaChange = useCallback(
    (token: string | null) => setCaptchaToken(token),
    []
  )
  const handleOtpCaptchaChange = useCallback(
    (token: string | null) => setOtpCaptchaToken(token),
    []
  )

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        fetchOptions: { headers: captchaHeaders(captchaToken) },
      })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      setStep("otp")
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp() {
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
        fetchOptions: { headers: captchaHeaders(otpCaptchaToken) },
      })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      setOtpSent(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      if (onVerified) {
        onVerified(email)
      } else {
        window.location.href = "/connexion"
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {step === "form" && (
        <form onSubmit={handleSignUp}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nom complet</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Au moins 8 caractères.
              </p>
            </div>
            <Turnstile onTokenChange={handleCaptchaChange} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Création…" : "Créer mon compte"}
            </Button>
          </div>
        </form>
      )}
      {step === "otp" && (
        <div className="grid gap-4">
          {otpSent ? (
            <form onSubmit={handleVerifyOtp} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="otp">Code de vérification</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Vérification…" : "Vérifier mon e-mail"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Un code de vérification sera envoyé à {email}. Vérifiez votre
                boîte de réception.
              </p>
              <Turnstile onTokenChange={handleOtpCaptchaChange} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || (captchaEnabled && !otpCaptchaToken)}
              >
                {loading ? "Envoi…" : "Envoyer le code"}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function translateAuthError(error: {
  code?: string
  message?: string
  status?: number
}): string {
  switch (error.code) {
    case "USER_ALREADY_EXISTS":
      return "Un compte existe déjà avec cette adresse e-mail."
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou mot de passe invalide."
    case "EMAIL_NOT_VERIFIED":
      return "Votre adresse e-mail n'est pas encore vérifiée."
    case "PASSWORD_TOO_SHORT":
      return "Le mot de passe doit contenir au moins 8 caractères."
    case "MISSING_RESPONSE":
      return "Veuillez valider le test de sécurité (Turnstile)."
    case "INVALID_RESPONSE":
      return "Le test de sécurité a échoué. Veuillez réessayer."
    default:
      return error.message ?? "Une erreur est survenue. Veuillez réessayer."
  }
}
