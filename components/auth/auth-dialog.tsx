"use client"

import { useCallback, useState } from "react"
import type { ReactNode } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AuthDialogName } from "@/lib/lien-de-connexion"

import {
  useAuthDialogDestination,
  useAuthDialogOpen,
  useAuthDialogs,
} from "./auth-dialogs"
import { SignInForm } from "./sign-in-form"
import { SignUpForm } from "./sign-up-form"
import type { SignInStep } from "./use-sign-in-flow"
import type { SignUpStep } from "./use-sign-up-flow"

const COMMERCE_PREFIXES = ["/produit", "/panier", "/checkout"]

function leadsToOrder(destination: string): boolean {
  return COMMERCE_PREFIXES.some(
    (prefix) =>
      destination === prefix ||
      destination.startsWith(`${prefix}/`) ||
      destination.startsWith(`${prefix}?`)
  )
}

function headingForDestination(
  dialog: AuthDialogName,
  destination: string | null
): string | null {
  if (!destination) return null
  const order = leadsToOrder(destination)
  if (dialog === "login") {
    return order
      ? "Connectez-vous pour finaliser votre commande"
      : "Connectez-vous pour continuer"
  }
  return order
    ? "Créez votre compte pour finaliser votre commande"
    : "Créez votre compte pour continuer"
}

type AuthDialogHeader = { step: SignInStep | SignUpStep; email: string }

const OTP_TITLE = "Vérifiez votre e-mail"

type AuthDialogConfig = {
  defaultTitle: string
  otpDescription: (email: string) => string
  swapPrefix: string
  swapLabel: string
  swapOpen: (options: { email?: string }) => void
  form: ReactNode
}

export function AuthDialog({
  dialog,
  hasGoogle = false,
  hasFacebook = false,
}: {
  dialog: AuthDialogName
  hasGoogle?: boolean
  hasFacebook?: boolean
}) {
  const { email: initialEmail, openLogin, openSignUp, close } = useAuthDialogs()
  const open = useAuthDialogOpen(dialog)

  const [header, setHeader] = useState<AuthDialogHeader>({
    step: "form",
    email: initialEmail,
  })
  const handleStepChange = useCallback(
    (step: SignInStep | SignUpStep, email: string) => {
      setHeader({ step, email })
    },
    []
  )
  const destination = useAuthDialogDestination()
  const contextualTitle = headingForDestination(dialog, destination)

  const config: Record<AuthDialogName, AuthDialogConfig> = {
    login: {
      defaultTitle: "Connexion à Eguidar",
      otpDescription: (otpEmail) =>
        `Saisissez le code de vérification envoyé à ${otpEmail}.`,
      swapPrefix: "Pas encore de compte ?",
      swapLabel: "Inscrivez-vous",
      swapOpen: openSignUp,
      form: (
        <SignInForm
          hasGoogle={hasGoogle}
          hasFacebook={hasFacebook}
          initialEmail={initialEmail}
          onStepChange={handleStepChange}
          onForgotPassword={close}
          onSuccess={close}
        />
      ),
    },
    signup: {
      defaultTitle: "Créer un compte",
      otpDescription: (otpEmail) =>
        `Vérifiez votre adresse e-mail pour finaliser votre inscription (${otpEmail}).`,
      swapPrefix: "Déjà un compte ?",
      swapLabel: "Se connecter",
      swapOpen: openLogin,
      form: (
        <SignUpForm
          initialEmail={initialEmail}
          onStepChange={handleStepChange}
          onVerified={(verifiedEmail) => openLogin({ email: verifiedEmail })}
        />
      ),
    },
  }

  const kind = config[dialog]
  const isOtp = header.step === "otp"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">
            {isOtp ? OTP_TITLE : (contextualTitle ?? kind.defaultTitle)}
          </DialogTitle>
          <DialogDescription>
            {isOtp ? (
              kind.otpDescription(header.email)
            ) : (
              <>
                {kind.swapPrefix}{" "}
                <button
                  type="button"
                  onClick={() => kind.swapOpen({ email: header.email })}
                  className="underline underline-offset-4 hover:text-primary"
                >
                  {kind.swapLabel}
                </button>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {kind.form}
      </DialogContent>
    </Dialog>
  )
}
