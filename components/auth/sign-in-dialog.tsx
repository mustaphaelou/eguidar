"use client"

import { Suspense } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SignInForm } from "@/components/auth/sign-in-form"
import { useAuthDialogs } from "@/components/auth/auth-dialogs-context"
import {
  headingForDestination,
  useAuthDestination,
} from "@/components/auth/auth-headings"
import { useAuthDialogHeader } from "@/components/auth/use-auth-dialog-header"
import type { SignInStep } from "@/components/auth/use-sign-in-flow"

export function SignInDialog({
  hasGoogle,
  hasApple,
}: {
  hasGoogle: boolean
  hasApple: boolean
}) {
  const { dialog, email, openSignUp, close } = useAuthDialogs()
  const open = dialog === "login"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent>
        <SignInDialogPanel
          initialEmail={email}
          hasGoogle={hasGoogle}
          hasApple={hasApple}
          openSignUp={openSignUp}
          close={close}
        />
      </DialogContent>
    </Dialog>
  )
}

function SignInDialogPanel({
  initialEmail,
  hasGoogle,
  hasApple,
  openSignUp,
  close,
}: {
  initialEmail: string
  hasGoogle: boolean
  hasApple: boolean
  openSignUp: (email?: string) => void
  close: () => void
}) {
  const { header, handleStepChange } =
    useAuthDialogHeader<SignInStep>(initialEmail)
  const destination = useAuthDestination()
  const contextualTitle = headingForDestination("login", destination)

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {header.step === "otp"
            ? "Vérifiez votre e-mail"
            : (contextualTitle ?? "Connexion à Eguidar")}
        </DialogTitle>
        <DialogDescription>
          {header.step === "otp" ? (
            <>Saisissez le code de vérification envoyé à {header.email}.</>
          ) : (
            <>
              Pas encore de compte ?{" "}
              <button
                type="button"
                onClick={() => openSignUp(header.email)}
                className="underline underline-offset-4 hover:text-primary"
              >
                Inscrivez-vous
              </button>
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <Suspense fallback={null}>
        <SignInForm
          hasGoogle={hasGoogle}
          hasApple={hasApple}
          initialEmail={initialEmail}
          onStepChange={handleStepChange}
          onForgotPassword={close}
          onSuccess={close}
        />
      </Suspense>
    </>
  )
}
