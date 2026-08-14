"use client"

import { useEffect } from "react"
import Link from "next/link"

import { HugeiconsIcon } from "@hugeicons/react"
import { AppleIcon, GoogleIcon } from "@hugeicons/core-free-icons"

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
import { Turnstile } from "@/components/auth/turnstile"
import {
  captchaEnabled,
  useSignInFlow,
  type SignInStep,
} from "@/components/auth/use-sign-in-flow"

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
    otpSent,
    otp,
    setOtp,
    otpCaptchaToken,
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

  useEffect(() => {
    onStepChange?.(step, email)
  }, [onStepChange, step, email])

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
              {notice && (
                <p className="text-sm font-medium text-green-600">{notice}</p>
              )}
              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? "Connexion…" : "Se connecter"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
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
            onClick={backToForm}
          >
            Retour à la connexion
          </Button>
        </div>
      )}
    </>
  )
}
