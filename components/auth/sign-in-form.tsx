"use client"

import { useCallback, useState } from "react"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Turnstile } from "@/components/auth/turnstile"
import { authClient } from "@/lib/client"

const captchaHeaders = (token: string | null) => (token ? { "x-captcha-response": token } : undefined)

const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

export function SignInForm({
  hasGoogle,
  hasApple,
}: {
  hasGoogle: boolean
  hasApple: boolean
}) {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get("next")
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [otpCaptchaToken, setOtpCaptchaToken] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<"form" | "otp">("form")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCaptchaChange = useCallback((token: string | null) => setCaptchaToken(token), [])
  const handleOtpCaptchaChange = useCallback((token: string | null) => setOtpCaptchaToken(token), [])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        fetchOptions: { headers: captchaHeaders(captchaToken) },
      })
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setStep("otp")
          return
        }
        setError(translateAuthError(result.error))
        return
      }
      window.location.href = next
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
      window.location.href = "/connexion"
    } finally {
      setLoading(false)
    }
  }

  async function handleSocial(provider: "google" | "apple") {
    setError(null)
    const result = await authClient.signIn.social({ provider, callbackURL: next })
    if (result.error) setError(translateAuthError(result.error))
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Se connecter</CardTitle>
        <CardDescription>
          {step === "otp"
            ? `Vérifiez votre adresse e-mail pour finaliser la connexion (${email}).`
            : "Connectez-vous pour accéder à votre compte et à vos commandes."}
        </CardDescription>
      </CardHeader>
      {step === "form" && (
        <>
          <CardContent className="grid gap-4">
            {(hasGoogle || hasApple) && (
              <div className="grid gap-2">
                {hasGoogle && (
                  <Button type="button" variant="outline" onClick={() => handleSocial("google")} disabled={loading}>
                    Continuer avec Google
                  </Button>
                )}
                {hasApple && (
                  <Button type="button" variant="outline" onClick={() => handleSocial("apple")} disabled={loading}>
                    Continuer avec Apple
                  </Button>
                )}
              </div>
            )}
            <form onSubmit={handleSignIn} className="grid gap-4">
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
                  autoComplete="current-password"
                />
              </div>
              <Turnstile onTokenChange={handleCaptchaChange} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Connexion…" : "Se connecter"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <a className="ml-1 text-primary hover:underline" href="/inscription">
              Inscrivez-vous
            </a>
          </CardFooter>
        </>
      )}
      {step === "otp" && (
        <CardContent className="grid gap-4">
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
                Un code de vérification sera envoyé à {email}. Vérifiez votre boîte de réception.
              </p>
              <Turnstile onTokenChange={handleOtpCaptchaChange} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="button" onClick={handleSendOtp} disabled={loading || (captchaEnabled && !otpCaptchaToken)}>
                {loading ? "Envoi…" : "Envoyer le code"}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function translateAuthError(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou mot de passe invalide."
    case "EMAIL_NOT_VERIFIED":
      return "Votre adresse e-mail n'est pas encore vérifiée."
    case "MISSING_RESPONSE":
      return "Veuillez valider le test de sécurité (Turnstile)."
    case "INVALID_RESPONSE":
      return "Le test de sécurité a échoué. Veuillez réessayer."
    default:
      return error.message ?? "Une erreur est survenue. Veuillez réessayer."
  }
}
