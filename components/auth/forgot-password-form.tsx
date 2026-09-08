"use client"

import Link from "next/link"

import { HugeiconsIcon } from "@hugeicons/react"
import { LayoutBottomIcon } from "@hugeicons/core-free-icons"

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Turnstile } from "@/components/auth/turnstile"
import { useForgotPasswordFlow } from "@/components/auth/use-forgot-password-flow"
import { loginUrl } from "@/lib/lien-de-connexion"

export function ForgotPasswordForm() {
  const {
    email,
    setEmail,
    otp,
    setOtp,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    captcha,
    step,
    error,
    loading,
    handleSendOtp,
    handleResetPassword,
    backToEmail,
  } = useForgotPasswordFlow()

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
          {step === "success" ? "Mot de passe modifié" : "Mot de passe oublié"}
        </CardTitle>
        <CardDescription>
          {step === "email" &&
            "Entrez votre adresse e-mail pour recevoir un code de réinitialisation."}
          {step === "otp" &&
            `Saisissez le code envoyé à ${email} et choisissez un nouveau mot de passe.`}
          {step === "success" &&
            "Votre mot de passe a été mis à jour avec succès."}
        </CardDescription>
      </CardHeader>

      {step === "email" && (
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleSendOtp}>
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
                  placeholder="nom@exemple.com"
                  aria-invalid={error ? true : undefined}
                />
              </Field>
              <Turnstile onTokenChange={captcha.onChange} />
              {error && <FieldError>{error}</FieldError>}
              <Field>
                <Button type="submit" disabled={loading || !captcha.ready}>
                  {loading ? "Envoi…" : "Envoyer le code"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
          <div className="text-center text-sm">
            <Link
              href={loginUrl()}
              className="text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Retour à la connexion
            </Link>
          </div>
        </CardContent>
      )}

      {step === "otp" && (
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleResetPassword}>
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
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="new-password">
                  Nouveau mot de passe
                </FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-invalid={error ? true : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Au moins 8 caractères.
                </p>
              </Field>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="confirm-password">
                  Confirmer le mot de passe
                </FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-invalid={error ? true : undefined}
                />
              </Field>
              {error && <FieldError>{error}</FieldError>}
              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? "Modification…" : "Réinitialiser le mot de passe"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
          <div className="flex flex-col items-center gap-2 text-sm">
            <Button
              type="button"
              variant="link"
              onClick={backToEmail}
              className="h-auto p-0 text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Modifier l&apos;adresse e-mail
            </Button>
            <Link
              href={loginUrl()}
              className="text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Retour à la connexion
            </Link>
          </div>
        </CardContent>
      )}

      {step === "success" && (
        <CardContent className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Vous pouvez maintenant vous connecter à votre compte avec votre
            nouveau mot de passe.
          </p>
          <Link
            href={loginUrl()}
            className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90"
          >
            Se connecter
          </Link>
        </CardContent>
      )}
    </Card>
  )
}
