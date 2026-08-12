"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppleIcon,
  GoogleIcon,
  LayoutBottomIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Turnstile } from "@/components/auth/turnstile"
import { authClient } from "@/lib/client"

const captchaHeaders = (token: string | null) =>
  token ? { "x-captcha-response": token } : undefined

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
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [otpCaptchaToken, setOtpCaptchaToken] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<"form" | "otp">("form")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCaptchaChange = useCallback(
    (token: string | null) => setCaptchaToken(token),
    []
  )
  const handleOtpCaptchaChange = useCallback(
    (token: string | null) => setOtpCaptchaToken(token),
    []
  )

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
    const result = await authClient.signIn.social({
      provider,
      callbackURL: next,
    })
    if (result.error) setError(translateAuthError(result.error))
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center gap-2 text-center">
        <Link
          href="/"
          aria-label="Accueil Eguidar"
          className="flex size-8 items-center justify-center rounded-md"
        >
          <HugeiconsIcon
            icon={LayoutBottomIcon}
            strokeWidth={2}
            className="size-6"
          />
        </Link>
        <CardTitle className="text-xl">
          {step === "otp" ? "Vérifiez votre e-mail" : "Connexion à Eguidar"}
        </CardTitle>
        <CardDescription>
          {step === "otp" ? (
            <>Saisissez le code de vérification envoyé à {email}.</>
          ) : (
            <>
              Pas encore de compte ?{" "}
              <Link
                href="/inscription"
                className="underline underline-offset-4 hover:text-primary"
              >
                Inscrivez-vous
              </Link>
            </>
          )}
        </CardDescription>
      </CardHeader>
      {step === "form" && (
        <CardContent className="flex flex-col gap-4">
          {(hasGoogle || hasApple) && (
            <>
              <div className="flex flex-col gap-2">
                {hasApple && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSocial("apple")}
                    disabled={loading}
                  >
                    <HugeiconsIcon icon={AppleIcon} data-icon="inline-start" />
                    Continuer avec Apple
                  </Button>
                )}
                {hasGoogle && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSocial("google")}
                    disabled={loading}
                  >
                    <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                    Continuer avec Google
                  </Button>
                )}
              </div>
              <FieldSeparator>ou</FieldSeparator>
            </>
          )}
          <form onSubmit={handleSignIn}>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  aria-invalid={error ? true : undefined}
                />
              </Field>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  aria-invalid={error ? true : undefined}
                />
              </Field>
              <Turnstile onTokenChange={handleCaptchaChange} />
              {error && <FieldError>{error}</FieldError>}
              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? "Connexion…" : "Se connecter"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      )}
      {step === "otp" && (
        <CardContent className="flex flex-col gap-4">
          {otpSent ? (
            <form onSubmit={handleVerifyOtp}>
              <FieldGroup>
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="otp">Code de vérification</FieldLabel>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                    placeholder="000000"
                    aria-invalid={error ? true : undefined}
                  />
                </Field>
                {error && <FieldError>{error}</FieldError>}
                <Field>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Vérification…" : "Vérifier mon e-mail"}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          ) : (
            <FieldGroup>
              <FieldDescription>
                Un code de vérification sera envoyé à {email}. Vérifiez votre
                boîte de réception.
              </FieldDescription>
              <Turnstile onTokenChange={handleOtpCaptchaChange} />
              {error && <FieldError>{error}</FieldError>}
              <Field>
                <Button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading || (captchaEnabled && !otpCaptchaToken)}
                >
                  {loading ? "Envoi…" : "Envoyer le code"}
                </Button>
              </Field>
            </FieldGroup>
          )}
          <Button
            type="button"
            variant="link"
            className="self-center"
            onClick={() => {
              setStep("form")
              setError(null)
            }}
          >
            Retour à la connexion
          </Button>
        </CardContent>
      )}
    </Card>
  )
}

function translateAuthError(error: {
  code?: string
  message?: string
  status?: number
}): string {
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
