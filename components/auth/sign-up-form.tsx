"use client"

import { useEffect, useState } from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { PasswordInput } from "@/components/auth/password-input"
import { Turnstile } from "@/components/auth/turnstile"
import {
  useSignUpFlow,
  type SignUpStep,
} from "@/components/auth/use-sign-up-flow"
import { collectFieldIssues, signUpSchema } from "@/lib/auth-form-schemas"

export function SignUpForm({
  initialEmail,
  onStepChange,
  onVerified,
}: {
  initialEmail?: string
  onStepChange?: (step: SignUpStep, email: string) => void
  onVerified?: (email: string) => void
}) {
  const [issues, setIssues] = useState<Record<string, string>>({})
  const {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    otpSent,
    otp,
    setOtp,
    step,
    error,
    loading,
    captcha,
    otpCaptcha,
    handleSignUp,
    handleSendOtp,
    handleVerifyOtp,
  } = useSignUpFlow({ initialEmail, onVerified })

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
              <Turnstile onTokenChange={captcha.onChange} />
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
              {error && <FieldError>{error}</FieldError>}
              <Button type="submit" disabled={loading}>
                {loading && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                )}
                {loading ? "Vérification…" : "Vérifier mon e-mail"}
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Un code de vérification sera envoyé à {email}. Vérifiez votre
                boîte de réception.
              </p>
              <Turnstile onTokenChange={otpCaptcha.onChange} />
              {error && <FieldError>{error}</FieldError>}
              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || !otpCaptcha.ready}
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
            </div>
          )}
        </div>
      )}
    </>
  )
}
