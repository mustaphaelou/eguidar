"use client"

// PROTOTYPE — three throwaway redesigns of the sign-in dialog, answering
// "what should the login surface look like?" (Google-only, stubbed handler).
// Switchable via ?variant=A|B|C. Delete this file when a variant wins.

import { useState } from "react"
import Link from "next/link"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  CreditCardIcon,
  GoogleIcon,
  Loading03Icon,
  ShieldKeyIcon,
  Tick02Icon,
  TruckDeliveryIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
} from "@/components/auth/use-sign-in-flow"
import {
  useAuthDialogOpen,
  useAuthDialogs,
} from "@/components/auth/auth-dialogs"
import { collectFieldIssues, signInSchema } from "@/lib/auth-form-schemas"

const GOOGLE_NOTE =
  "Prototype : la connexion Google sera activée avec GOOGLE_CLIENT_ID."

function usePrototypeForm(initialEmail?: string) {
  const flow = useSignInFlow({ initialEmail })
  const [issues, setIssues] = useState<Record<string, string>>({})
  const [googleNote, setGoogleNote] = useState(false)

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
    const parsed = signInSchema.safeParse({
      email: flow.email,
      password: flow.password,
    })
    if (!parsed.success) {
      setIssues(collectFieldIssues(parsed.error))
      return
    }
    setIssues({})
    await flow.handleSignIn(e)
  }

  return { flow, issues, googleNote, setGoogleNote, updateIssue, handleSubmit }
}

function Spinner() {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      data-icon="inline-start"
      className="animate-spin"
    />
  )
}

/* ------------------------------------------------------------------ */
/* A — Carte épurée : la carte centrée actuelle, respirée et clarifiée */
/* ------------------------------------------------------------------ */

export function SignInVariantA() {
  const open = useAuthDialogOpen("login")
  const { email, openSignUp, close } = useAuthDialogs()
  const { flow, issues, googleNote, setGoogleNote, updateIssue, handleSubmit } =
    usePrototypeForm(email)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">Connexion à Eguidar</DialogTitle>
          <DialogDescription>
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={() => openSignUp({ email: flow.email })}
              className="underline underline-offset-4 hover:text-primary"
            >
              Inscrivez-vous
            </button>
          </DialogDescription>
        </DialogHeader>
        {flow.step === "form" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setGoogleNote(true)}
                disabled={flow.loading}
              >
                <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                Continuer avec Google
              </Button>
              {googleNote && (
                <p className="text-xs text-muted-foreground">{GOOGLE_NOTE}</p>
              )}
            </div>
            <FieldSeparator>ou par e-mail</FieldSeparator>
            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup className="gap-3">
                <Field data-invalid={Boolean(issues.email || flow.error)}>
                  <FieldLabel htmlFor="a-email">E-mail</FieldLabel>
                  <Input
                    id="a-email"
                    type="email"
                    value={flow.email}
                    onChange={(e) => {
                      flow.setEmail(e.target.value)
                      updateIssue("email")
                    }}
                    autoFocus
                    autoComplete="email"
                    placeholder="name@email.ma"
                    aria-invalid={Boolean(issues.email)}
                    aria-describedby={
                      issues.email ? "a-email-issue" : undefined
                    }
                  />
                  <FieldError id="a-email-issue">{issues.email}</FieldError>
                </Field>
                <Field data-invalid={Boolean(issues.password || flow.error)}>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="a-password">Mot de passe</FieldLabel>
                    <Link
                      href="/mot-de-passe-oublie"
                      onClick={close}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <PasswordInput
                    id="a-password"
                    value={flow.password}
                    onChange={(e) => {
                      flow.setPassword(e.target.value)
                      updateIssue("password")
                    }}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={Boolean(issues.password)}
                    aria-describedby={
                      issues.password ? "a-password-issue" : undefined
                    }
                  />
                  <FieldError id="a-password-issue">
                    {issues.password}
                  </FieldError>
                </Field>
                <Turnstile onTokenChange={flow.handleCaptchaChange} />
                {flow.error && <FieldError>{flow.error}</FieldError>}
                <Field>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={
                      flow.loading || (captchaEnabled && !flow.captchaToken)
                    }
                  >
                    {flow.loading && <Spinner />}
                    {flow.loading ? "Connexion…" : "Se connecter"}
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
        {flow.step === "otp" && (
          <div className="flex flex-col gap-4">
            {flow.otpSent ? (
              <form onSubmit={flow.handleVerifyOtp} noValidate>
                <FieldGroup>
                  <Field data-invalid={Boolean(flow.error)}>
                    <FieldLabel htmlFor="a-otp">
                      Code de vérification
                    </FieldLabel>
                    <Input
                      id="a-otp"
                      inputMode="numeric"
                      maxLength={6}
                      value={flow.otp}
                      onChange={(e) => flow.setOtp(e.target.value)}
                      placeholder="000000"
                      aria-invalid={flow.error ? true : undefined}
                    />
                  </Field>
                  {flow.error && <FieldError>{flow.error}</FieldError>}
                  <Field>
                    <Button type="submit" size="lg" disabled={flow.loading}>
                      {flow.loading && <Spinner />}
                      {flow.loading ? "Vérification…" : "Vérifier mon e-mail"}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            ) : (
              <FieldGroup>
                <FieldDescription>
                  Un code de vérification sera envoyé à {flow.email}. Vérifiez
                  votre boîte de réception.
                </FieldDescription>
                <Turnstile onTokenChange={flow.handleOtpCaptchaChange} />
                {flow.error && <FieldError>{flow.error}</FieldError>}
                <Field>
                  <Button
                    type="button"
                    size="lg"
                    onClick={flow.handleSendOtp}
                    disabled={
                      flow.loading || (captchaEnabled && !flow.otpCaptchaToken)
                    }
                  >
                    {flow.loading && <Spinner />}
                    {flow.loading ? "Envoi…" : "Envoyer le code"}
                  </Button>
                </Field>
              </FieldGroup>
            )}
            <Button
              type="button"
              variant="link"
              className="self-center"
              onClick={flow.backToForm}
            >
              Retour à la connexion
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* B — Écran partagé : panneau de marque + formulaire côte à côte      */
/* ------------------------------------------------------------------ */

export function SignInVariantB() {
  const open = useAuthDialogOpen("login")
  const { email, openSignUp, close } = useAuthDialogs()
  const { flow, issues, googleNote, setGoogleNote, updateIssue, handleSubmit } =
    usePrototypeForm(email)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-3xl sm:overflow-hidden">
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <aside className="hidden flex-col justify-between gap-8 bg-primary p-8 text-primary-foreground sm:flex">
            <p className="text-xl font-semibold tracking-tight">Eguidar</p>
            <div className="flex flex-col gap-5">
              <p className="text-lg leading-snug font-medium">
                Connectez-vous pour commander en un clin d&apos;œil.
              </p>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li className="flex items-center gap-2.5">
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    className="size-4 shrink-0"
                  />
                  Suivi de commande en temps réel
                </li>
                <li className="flex items-center gap-2.5">
                  <HugeiconsIcon
                    icon={TruckDeliveryIcon}
                    className="size-4 shrink-0"
                  />
                  Paiement à la livraison, partout au Maroc
                </li>
                <li className="flex items-center gap-2.5">
                  <HugeiconsIcon
                    icon={ShieldKeyIcon}
                    className="size-4 shrink-0"
                  />
                  Vos données restent chez nous
                </li>
                <li className="flex items-center gap-2.5">
                  <HugeiconsIcon
                    icon={CreditCardIcon}
                    className="size-4 shrink-0"
                  />
                  Historique de commandes et réachat facile
                </li>
              </ul>
            </div>
            <p className="text-xs opacity-70">
              Paiement à la livraison — aucun paiement en ligne requis.
            </p>
          </aside>
          <div className="relative flex flex-col gap-5 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8 sm:pb-8">
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute end-3 top-3"
                />
              }
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              <span className="sr-only">Fermer</span>
            </DialogClose>
            <DialogHeader>
              <DialogTitle className="text-lg">Bon retour.</DialogTitle>
              <DialogDescription>
                Pas encore de compte ?{" "}
                <button
                  type="button"
                  onClick={() => openSignUp({ email: flow.email })}
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Inscrivez-vous
                </button>
              </DialogDescription>
            </DialogHeader>
            {flow.step === "form" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setGoogleNote(true)}
                    disabled={flow.loading}
                  >
                    <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                    Continuer avec Google
                  </Button>
                  {googleNote && (
                    <p className="text-xs text-muted-foreground">
                      {GOOGLE_NOTE}
                    </p>
                  )}
                </div>
                <FieldSeparator>ou par e-mail</FieldSeparator>
                <form onSubmit={handleSubmit} noValidate>
                  <FieldGroup className="gap-3">
                    <Field data-invalid={Boolean(issues.email || flow.error)}>
                      <FieldLabel htmlFor="b-email">E-mail</FieldLabel>
                      <Input
                        id="b-email"
                        type="email"
                        value={flow.email}
                        onChange={(e) => {
                          flow.setEmail(e.target.value)
                          updateIssue("email")
                        }}
                        autoFocus
                        autoComplete="email"
                        placeholder="name@email.ma"
                        aria-invalid={Boolean(issues.email)}
                        aria-describedby={
                          issues.email ? "b-email-issue" : undefined
                        }
                      />
                      <FieldError id="b-email-issue">{issues.email}</FieldError>
                    </Field>
                    <Field
                      data-invalid={Boolean(issues.password || flow.error)}
                    >
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor="b-password">
                          Mot de passe
                        </FieldLabel>
                        <Link
                          href="/mot-de-passe-oublie"
                          onClick={close}
                          className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          Mot de passe oublié ?
                        </Link>
                      </div>
                      <PasswordInput
                        id="b-password"
                        value={flow.password}
                        onChange={(e) => {
                          flow.setPassword(e.target.value)
                          updateIssue("password")
                        }}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        aria-invalid={Boolean(issues.password)}
                        aria-describedby={
                          issues.password ? "b-password-issue" : undefined
                        }
                      />
                      <FieldError id="b-password-issue">
                        {issues.password}
                      </FieldError>
                    </Field>
                    <Turnstile onTokenChange={flow.handleCaptchaChange} />
                    {flow.error && <FieldError>{flow.error}</FieldError>}
                    <Field>
                      <Button
                        type="submit"
                        size="lg"
                        disabled={
                          flow.loading || (captchaEnabled && !flow.captchaToken)
                        }
                      >
                        {flow.loading && <Spinner />}
                        {flow.loading ? "Connexion…" : "Se connecter"}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              </div>
            )}
            {flow.step === "otp" && (
              <div className="flex flex-col gap-4">
                {flow.otpSent ? (
                  <form onSubmit={flow.handleVerifyOtp} noValidate>
                    <FieldGroup>
                      <Field data-invalid={Boolean(flow.error)}>
                        <FieldLabel htmlFor="b-otp">
                          Code de vérification
                        </FieldLabel>
                        <Input
                          id="b-otp"
                          inputMode="numeric"
                          maxLength={6}
                          value={flow.otp}
                          onChange={(e) => flow.setOtp(e.target.value)}
                          placeholder="000000"
                          aria-invalid={flow.error ? true : undefined}
                        />
                      </Field>
                      {flow.error && <FieldError>{flow.error}</FieldError>}
                      <Field>
                        <Button type="submit" size="lg" disabled={flow.loading}>
                          {flow.loading && <Spinner />}
                          {flow.loading
                            ? "Vérification…"
                            : "Vérifier mon e-mail"}
                        </Button>
                      </Field>
                    </FieldGroup>
                  </form>
                ) : (
                  <FieldGroup>
                    <FieldDescription>
                      Un code de vérification sera envoyé à {flow.email}.
                    </FieldDescription>
                    <Turnstile onTokenChange={flow.handleOtpCaptchaChange} />
                    {flow.error && <FieldError>{flow.error}</FieldError>}
                    <Field>
                      <Button
                        type="button"
                        size="lg"
                        onClick={flow.handleSendOtp}
                        disabled={
                          flow.loading ||
                          (captchaEnabled && !flow.otpCaptchaToken)
                        }
                      >
                        {flow.loading && <Spinner />}
                        {flow.loading ? "Envoi…" : "Envoyer le code"}
                      </Button>
                    </Field>
                  </FieldGroup>
                )}
                <Button
                  type="button"
                  variant="link"
                  className="self-start"
                  onClick={flow.backToForm}
                >
                  Retour à la connexion
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* C — Google d'abord : le bouton Google en héros, e-mail en second    */
/* ------------------------------------------------------------------ */

export function SignInVariantC() {
  const open = useAuthDialogOpen("login")
  const { email, openSignUp, close } = useAuthDialogs()
  const { flow, issues, googleNote, setGoogleNote, updateIssue, handleSubmit } =
    usePrototypeForm(email)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-lg">Connexion à Eguidar</DialogTitle>
          <DialogDescription>Un clic et vous êtes de retour.</DialogDescription>
        </DialogHeader>
        {flow.step === "form" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex w-full flex-col items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xl"
                className="w-full text-base"
                onClick={() => setGoogleNote(true)}
                disabled={flow.loading}
              >
                <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                Continuer avec Google
              </Button>
              {googleNote && (
                <p className="text-xs text-muted-foreground">{GOOGLE_NOTE}</p>
              )}
            </div>
            <FieldSeparator>ou avec votre e-mail</FieldSeparator>
            <form onSubmit={handleSubmit} noValidate className="w-full">
              <FieldGroup className="gap-3">
                <Field data-invalid={Boolean(issues.email || flow.error)}>
                  <FieldLabel htmlFor="c-email">E-mail</FieldLabel>
                  <Input
                    id="c-email"
                    type="email"
                    value={flow.email}
                    onChange={(e) => {
                      flow.setEmail(e.target.value)
                      updateIssue("email")
                    }}
                    autoComplete="email"
                    placeholder="name@email.ma"
                    aria-invalid={Boolean(issues.email)}
                    aria-describedby={
                      issues.email ? "c-email-issue" : undefined
                    }
                  />
                  <FieldError id="c-email-issue">{issues.email}</FieldError>
                </Field>
                <Field data-invalid={Boolean(issues.password || flow.error)}>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="c-password">Mot de passe</FieldLabel>
                    <Link
                      href="/mot-de-passe-oublie"
                      onClick={close}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <PasswordInput
                    id="c-password"
                    value={flow.password}
                    onChange={(e) => {
                      flow.setPassword(e.target.value)
                      updateIssue("password")
                    }}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={Boolean(issues.password)}
                    aria-describedby={
                      issues.password ? "c-password-issue" : undefined
                    }
                  />
                  <FieldError id="c-password-issue">
                    {issues.password}
                  </FieldError>
                </Field>
                <Turnstile onTokenChange={flow.handleCaptchaChange} />
                {flow.error && <FieldError>{flow.error}</FieldError>}
                <Field>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={
                      flow.loading || (captchaEnabled && !flow.captchaToken)
                    }
                  >
                    {flow.loading && <Spinner />}
                    {flow.loading ? "Connexion…" : "Se connecter"}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
            <p className="text-center text-xs text-muted-foreground">
              Pas encore de compte ?{" "}
              <button
                type="button"
                onClick={() => openSignUp({ email: flow.email })}
                className="underline underline-offset-4 hover:text-primary"
              >
                Inscrivez-vous
              </button>
              {" — "}paiement à la livraison, aucun paiement en ligne requis. En
              continuant, vous acceptez nos{" "}
              <Link
                href="/conditions"
                className="underline underline-offset-4 hover:text-primary"
              >
                conditions
              </Link>
              .
            </p>
          </div>
        )}
        {flow.step === "otp" && (
          <div className="flex flex-col items-center gap-4">
            {flow.otpSent ? (
              <form
                onSubmit={flow.handleVerifyOtp}
                noValidate
                className="w-full"
              >
                <FieldGroup>
                  <Field data-invalid={Boolean(flow.error)}>
                    <FieldLabel htmlFor="c-otp">
                      Code de vérification
                    </FieldLabel>
                    <Input
                      id="c-otp"
                      inputMode="numeric"
                      maxLength={6}
                      value={flow.otp}
                      onChange={(e) => flow.setOtp(e.target.value)}
                      placeholder="000000"
                      aria-invalid={flow.error ? true : undefined}
                    />
                  </Field>
                  {flow.error && <FieldError>{flow.error}</FieldError>}
                  <Field>
                    <Button type="submit" size="lg" disabled={flow.loading}>
                      {flow.loading && <Spinner />}
                      {flow.loading ? "Vérification…" : "Vérifier mon e-mail"}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            ) : (
              <FieldGroup>
                <FieldDescription>
                  Un code de vérification sera envoyé à {flow.email}.
                </FieldDescription>
                <Turnstile onTokenChange={flow.handleOtpCaptchaChange} />
                {flow.error && <FieldError>{flow.error}</FieldError>}
                <Field>
                  <Button
                    type="button"
                    size="lg"
                    onClick={flow.handleSendOtp}
                    disabled={
                      flow.loading || (captchaEnabled && !flow.otpCaptchaToken)
                    }
                  >
                    {flow.loading && <Spinner />}
                    {flow.loading ? "Envoi…" : "Envoyer le code"}
                  </Button>
                </Field>
              </FieldGroup>
            )}
            <Button
              type="button"
              variant="link"
              className="self-center"
              onClick={flow.backToForm}
            >
              Retour à la connexion
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
