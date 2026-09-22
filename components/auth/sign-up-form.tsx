"use client"

import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import type { AuthFlowStep } from "@/components/auth/auth-dialog"
import { PasswordInput } from "@/components/auth/password-input"
import { useSignUpFlow } from "@/components/auth/use-sign-up-flow"
import { collectFieldIssues, signUpSchema } from "@/lib/auth-form-schemas"

export function SignUpForm({
  initialEmail,
  step: stepProp,
  email: emailProp,
  onStepChange,
  onVerified,
}: {
  initialEmail?: string
  step?: AuthFlowStep
  email?: string
  onStepChange?: (step: AuthFlowStep, email: string) => void
  onVerified?: (email: string) => void
}) {
  const [issues, setIssues] = useState<Record<string, string>>({})
  const [fallbackStep, setFallbackStep] = useState<AuthFlowStep>("form")
  const [fallbackEmail, setFallbackEmail] = useState(initialEmail ?? "")
  const step = stepProp ?? fallbackStep
  const email = emailProp ?? fallbackEmail
  const {
    name,
    setName,
    setEmail,
    password,
    setPassword,
    otp,
    error,
    loading,
    captcha,
    handleSignUp,
  } = useSignUpFlow({
    step,
    email,
    onStepChange: (nextStep, nextEmail) => {
      setFallbackStep(nextStep)
      setFallbackEmail(nextEmail)
      onStepChange?.(nextStep, nextEmail)
    },
    onVerified,
  })

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
    const parsed = signUpSchema.safeParse({ name, email, password })
    if (!parsed.success) {
      setIssues(collectFieldIssues(parsed.error))
      return
    }
    setIssues({})
    await handleSignUp(e)
  }

  return (
    <>
      {step === "form" && (
        <>
          <form onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nom complet</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    updateIssue("name")
                  }}
                  autoFocus
                  autoComplete="name"
                  placeholder="Ex. : Salma Bennani"
                  aria-invalid={Boolean(issues.name)}
                  aria-describedby={issues.name ? "name-issue" : undefined}
                />
                <FieldError id="name-issue">{issues.name}</FieldError>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    updateIssue("email")
                  }}
                  autoComplete="email"
                  placeholder="name@email.ma"
                  aria-invalid={Boolean(issues.email)}
                  aria-describedby={
                    issues.email ? "signup-email-issue" : undefined
                  }
                />
                <FieldError id="signup-email-issue">{issues.email}</FieldError>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Mot de passe</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    updateIssue("password")
                  }}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  aria-invalid={Boolean(issues.password)}
                  aria-describedby={
                    issues.password ? "signup-password-issue" : "password-hint"
                  }
                />
                <FieldError id="signup-password-issue">
                  {issues.password}
                </FieldError>
                {!issues.password && (
                  <p
                    id="password-hint"
                    className="text-xs text-muted-foreground"
                  >
                    Au moins 8 caractères.
                  </p>
                )}
              </div>
              {captcha.field}
              {error && <FieldError>{error}</FieldError>}
              <Button type="submit" disabled={loading || !captcha.ready}>
                {loading && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                )}
                {loading ? "Création…" : "Créer mon compte"}
              </Button>
            </div>
          </form>
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
        </>
      )}
      {step === "otp" && (
        <div className="grid gap-4">
          {otp.otpSent ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                otp.verify()
              }}
              className="grid gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="otp">Code de vérification</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp.otp}
                  onChange={(e) => otp.setOtp(e.target.value)}
                  required
                  placeholder="000000"
                />
              </div>
              {otp.error && <FieldError>{otp.error}</FieldError>}
              <Button type="submit" disabled={otp.loading}>
                {otp.loading && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                )}
                {otp.loading ? "Vérification…" : "Vérifier mon e-mail"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Un code de vérification sera envoyé à {email}. Vérifiez votre
                boîte de réception.
              </p>
              {otp.captchaField}
              {otp.error && <FieldError>{otp.error}</FieldError>}
              <Button
                type="button"
                onClick={() => otp.send()}
                disabled={otp.loading || !otp.captchaReady}
              >
                {otp.loading && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                )}
                {otp.loading ? "Envoi…" : "Envoyer le code"}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
