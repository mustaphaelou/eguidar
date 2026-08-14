"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SignUpForm, type SignUpStep } from "@/components/auth/sign-up-form"
import { useAuthDialogs } from "@/components/auth/auth-dialogs-context"
import { useAuthDialogHeader } from "@/components/auth/use-auth-dialog-header"

export function SignUpDialog() {
  const { dialog, email, openLogin, close } = useAuthDialogs()
  const open = dialog === "signup"

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
  openLogin: (email?: string) => void
}) {
  const { header, handleStepChange } =
    useAuthDialogHeader<SignUpStep>(initialEmail)

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {header.step === "otp" ? "Vérifiez votre e-mail" : "Créer un compte"}
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
                onClick={() => openLogin(header.email)}
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
        onVerified={(verifiedEmail) => openLogin(verifiedEmail)}
      />
    </>
  )
}
