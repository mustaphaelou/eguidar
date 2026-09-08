"use client"

import { useCallback, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SignUpForm, type SignUpStep } from "@/components/auth/sign-up-form"
import {
  useAuthDialogOpen,
  useAuthDialogs,
} from "@/components/auth/auth-dialogs"
import {
  headingForDestination,
  useAuthDestination,
} from "@/components/auth/auth-headings"

export function SignUpDialog() {
  const { email, openLogin, close } = useAuthDialogs()
  const open = useAuthDialogOpen("signup")

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent>
        <SignUpDialogPanel initialEmail={email} openLogin={openLogin} />
      </DialogContent>
    </Dialog>
  )
}

function SignUpDialogPanel({
  initialEmail,
  openLogin,
}: {
  initialEmail: string
  openLogin: (options?: { email?: string; next?: string }) => void
}) {
  const [header, setHeader] = useState<{ step: SignUpStep; email: string }>({
    step: "form",
    email: initialEmail,
  })
  const handleStepChange = useCallback((step: SignUpStep, email: string) => {
    setHeader({ step, email })
  }, [])
  const destination = useAuthDestination()
  const contextualTitle = headingForDestination("signup", destination)

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {header.step === "otp"
            ? "Vérifiez votre e-mail"
            : (contextualTitle ?? "Créer un compte")}
        </DialogTitle>
        <DialogDescription>
          {header.step === "otp" ? (
            <>
              Vérifiez votre adresse e-mail pour finaliser votre inscription (
              {header.email}).
            </>
          ) : (
            <>
              Déjà un compte ?{" "}
              <button
                type="button"
                onClick={() => openLogin({ email: header.email })}
                className="underline underline-offset-4 hover:text-primary"
              >
                Se connecter
              </button>
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <SignUpForm
        initialEmail={initialEmail}
        onStepChange={handleStepChange}
        onVerified={(verifiedEmail) => openLogin({ email: verifiedEmail })}
      />
    </>
  )
}
