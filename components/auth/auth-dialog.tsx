"use client"

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
  useAuthDialogErrorDestination,
  useAuthDialogOpen,
  useAuthDialogs,
  usePageAddressWithoutAuthParams,
} from "./auth-dialogs"
import { SignInForm } from "./sign-in-form"
import { SignUpForm } from "./sign-up-form"
import { useSignInFlow } from "./use-sign-in-flow"
import { useSignUpFlow } from "./use-sign-up-flow"

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

const OTP_TITLE = "Vérifiez votre e-mail"

const ENTETES: Record<
  AuthDialogName,
  {
    defaultTitle: string
    otpDescription: (email: string) => string
    swapPrefix: string
    swapLabel: string
  }
> = {
  login: {
    defaultTitle: "Connexion à Eguidar",
    otpDescription: (otpEmail) =>
      `Saisissez le code de vérification envoyé à ${otpEmail}.`,
    swapPrefix: "Pas encore de compte ?",
    swapLabel: "Inscrivez-vous",
  },
  signup: {
    defaultTitle: "Créer un compte",
    otpDescription: (otpEmail) =>
      `Vérifiez votre adresse e-mail pour finaliser votre inscription (${otpEmail}).`,
    swapPrefix: "Déjà un compte ?",
    swapLabel: "Se connecter",
  },
}

function AuthDialogHeader({
  dialog,
  step,
  email,
  destination,
  onSwap,
}: {
  dialog: AuthDialogName
  step: "form" | "otp"
  email: string
  destination: string | null
  onSwap: () => void
}) {
  const entete = ENTETES[dialog]
  const contextualTitle = headingForDestination(dialog, destination)
  const isOtp = step === "otp"

  return (
    <DialogHeader>
      <DialogTitle className="text-lg">
        {isOtp ? OTP_TITLE : (contextualTitle ?? entete.defaultTitle)}
      </DialogTitle>
      <DialogDescription>
        {isOtp ? (
          entete.otpDescription(email)
        ) : (
          <>
            {entete.swapPrefix}{" "}
            <button
              type="button"
              onClick={onSwap}
              className="underline underline-offset-4 hover:text-primary"
            >
              {entete.swapLabel}
            </button>
          </>
        )}
      </DialogDescription>
    </DialogHeader>
  )
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
  const { close } = useAuthDialogs()
  const open = useAuthDialogOpen(dialog)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent>
        {dialog === "login" ? (
          <ConnexionPanel hasGoogle={hasGoogle} hasFacebook={hasFacebook} />
        ) : (
          <InscriptionPanel />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConnexionPanel({
  hasGoogle,
  hasFacebook,
}: {
  hasGoogle: boolean
  hasFacebook: boolean
}) {
  const { email, openSignUp, close } = useAuthDialogs()
  const destination = useAuthDialogDestination()
  const pageAddress = usePageAddressWithoutAuthParams()
  const socialReturnAddress = useAuthDialogErrorDestination()
  const flow = useSignInFlow({
    email,
    onSuccess: close,
    destination,
    pageAddress,
    socialReturnAddress,
  })

  return (
    <>
      <AuthDialogHeader
        dialog="login"
        step={flow.step}
        email={flow.email}
        destination={destination}
        onSwap={() => openSignUp({ email: flow.email })}
      />
      <SignInForm
        hasGoogle={hasGoogle}
        hasFacebook={hasFacebook}
        flow={flow}
        onForgotPassword={close}
      />
    </>
  )
}

function InscriptionPanel() {
  const { email, openLogin } = useAuthDialogs()
  const destination = useAuthDialogDestination()
  const flow = useSignUpFlow({
    email,
    onVerified: (verifiedEmail) => openLogin({ email: verifiedEmail }),
  })

  return (
    <>
      <AuthDialogHeader
        dialog="signup"
        step={flow.step}
        email={flow.email}
        destination={destination}
        onSwap={() => openLogin({ email: flow.email })}
      />
      <SignUpForm flow={flow} />
    </>
  )
}
