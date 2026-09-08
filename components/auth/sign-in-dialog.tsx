"use client"

import { useCallback, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SignInForm } from "@/components/auth/sign-in-form"
import {
  useAuthDialogDestination,
  useAuthDialogOpen,
  useAuthDialogs,
} from "@/components/auth/auth-dialogs"
import { headingForDestination } from "@/components/auth/auth-headings"
import type { SignInStep } from "@/components/auth/use-sign-in-flow"

export function SignInDialog({
  hasGoogle,
  hasApple,
}: {
  hasGoogle: boolean
  hasApple: boolean
}) {
  const { email, openSignUp, close } = useAuthDialogs()
  const open = useAuthDialogOpen("login")

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
  openSignUp: (options?: { email?: string }) => void
  close: () => void
}) {
  const [header, setHeader] = useState<{ step: SignInStep; email: string }>({
    step: "form",
    email: initialEmail,
  })
  const handleStepChange = useCallback((step: SignInStep, email: string) => {
    setHeader({ step, email })
  }, [])
  const destination = useAuthDialogDestination()
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
                onClick={() => openSignUp({ email: header.email })}
                className="underline underline-offset-4 hover:text-primary"
              >
                Inscrivez-vous
              </button>
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <SignInForm
        hasGoogle={hasGoogle}
        hasApple={hasApple}
        initialEmail={initialEmail}
        onStepChange={handleStepChange}
        onForgotPassword={close}
        onSuccess={close}
      />
    </>
  )
}
