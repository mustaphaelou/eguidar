"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  AppleIcon,
  GoogleIcon,
  Loading03Icon,
  TruckDeliveryIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/password-input"
import { Turnstile } from "@/components/auth/turnstile"
import {
  captchaEnabled,
  useSignInFlow,
  type SignInStep,
} from "@/components/auth/use-sign-in-flow"
import { collectFieldIssues, signInSchema } from "@/lib/auth-form-schemas"

export function SignInForm({
  hasGoogle,
  hasApple,
  initialEmail,
  onForgotPassword,
  onStepChange,
  onSuccess,
}: {
  hasGoogle: boolean
  hasApple: boolean
  initialEmail?: string
  onForgotPassword?: () => void
  onStepChange?: (step: SignInStep, email: string) => void
  onSuccess?: () => void
}) {
  const {
    email,
    setEmail,
    password,
    setPassword,
    captchaToken,
    otpCaptchaToken,
    otpSent,
    otp,
    setOtp,
    step,
    error,
    notice,
    loading,
    handleCaptchaChange,
    handleOtpCaptchaChange,
    handleSignIn,
    handleSendOtp,
    handleVerifyOtp,
    handleSocial,
    backToForm,
  } = useSignInFlow({ initialEmail, onSuccess })
  const [issues, setIssues] = useState<Record<string, string>>({})

  useEffect(() => {
    onStepChange?.(step, email)
  }, [onStepChange, step, email])

  function updateIssue(key: string) {
    setIssues((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) {
      setIssues(collectFieldIssues(parsed.error))
      return
    }
    setIssues({})
    await handleSignIn(e)
  }

  return (
    <>
      {step === "form" && (
        <div className="flex flex-col gap-4">
          {(hasGoogle || hasApple) && (
            <>
              <div className="flex flex-col gap-2">
                {hasApple && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
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
                    size="lg"
                    onClick={() => handleSocial("google")}
                    disabled={loading}
                  >
                    <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                    Continuer avec Google
                  </Button>
                )}
              </div>
              <FieldSeparator>ou par e-mail</FieldSeparator>
            </>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <FieldGroup className="gap-3">
              <Field data-invalid={Boolean(issues.email || error)}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    updateIssue("email")
                  }}
                  autoFocus
                  autoComplete="email"
                  placeholder="name@email.ma"
                  aria-invalid={Boolean(issues.email)}
                  aria-describedby={issues.email ? "email-issue" : undefined}
                />
                <FieldError id="email-issue">{issues.email}</FieldError>
              </Field>
              <Field data-invalid={Boolean(issues.password || error)}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
                  <Link
                    href="/mot-de-passe-oublie"
                    onClick={onForgotPassword}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    updateIssue("password")
                  }}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={Boolean(issues.password)}
                  aria-describedby={
                    issues.password ? "password-issue" : undefined
                  }
                />
                <FieldError id="password-issue">{issues.password}</FieldError>
              </Field>
              <Turnstile onTokenChange={handleCaptchaChange} />
              {error && <FieldError>{error}</FieldError>}
              {notice && (
                <p className="text-sm font-medium text-green-600">{notice}</p>
              )}
              <Field>
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading || (captchaEnabled && !captchaToken)}
                >
                  {loading && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  )}
                  {loading ? "Connexion…" : "Se connecter"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
          <div className="flex items-start gap-2.5 rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={TruckDeliveryIcon}
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              Paiement à la livraison — aucun paiement en ligne requis.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            En continuant, vous acceptez nos{" "}
            <Link
              href="/conditions"
              className="underline underline-offset-4 hover:text-primary"
            >
              conditions générales et de livraison
            </Link>
            .
          </p>
        </div>
      )}
      {step === "otp" && (
        <div className="flex flex-col gap-4">
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
                  <Button type="submit" size="lg" disabled={loading}>
                    {loading && (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    )}
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
                  size="lg"
                  onClick={handleSendOtp}
                  disabled={loading || (captchaEnabled && !otpCaptchaToken)}
                >
                  {loading && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  )}
                  {loading ? "Envoi…" : "Envoyer le code"}
                </Button>
              </Field>
            </FieldGroup>
          )}
          <Button
            type="button"
            variant="link"
            className="self-center"
            onClick={backToForm}
          >
            Retour à la connexion
          </Button>
        </div>
      )}
    </>
  )
}
