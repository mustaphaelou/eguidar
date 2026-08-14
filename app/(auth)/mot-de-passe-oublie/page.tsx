import { Suspense } from "react"
import type { Metadata } from "next"

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Réinitialisez le mot de passe de votre compte client Eguidar.",
}

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="sr-only">Réinitialiser le mot de passe — Eguidar</h1>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </>
  )
}
