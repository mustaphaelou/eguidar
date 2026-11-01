"use client"

import { useState } from "react"

import type { AuthFlowStep } from "@/components/auth/auth-dialog"
import {
  useAuthDialogDestination,
  useAuthDialogErrorDestination,
  usePageAddressWithoutAuthParams,
} from "@/components/auth/auth-dialogs"
import {
  resolveAuthRefusal,
  translateAuthError,
} from "@/components/auth/auth-form-glue"
import { useOtpExchange } from "@/components/auth/verification-de-l-email"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import { authClient } from "@/lib/client"
import type { FournisseurSocial } from "@/lib/oauth-providers"

export type SignInFlow = ReturnType<typeof useSignInFlow>

export function useSignInFlow({
  step,
  email,
  onStepChange,
  onSuccess,
}: {
  step: AuthFlowStep
  email: string
  onStepChange: (step: AuthFlowStep, email: string) => void
  onSuccess?: () => void
}) {
  const next = useAuthDialogDestination()
  const pageAddress = usePageAddressWithoutAuthParams()
  const errorDestination = useAuthDialogErrorDestination()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useTestDeSecurite()
  const otp = useOtpExchange({
    email,
    type: "email-verification",
    onVerified: () => {
      setNotice("Votre e-mail est vérifié. Connectez-vous.")
      backToForm()
    },
  })

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        fetchOptions: { headers: captcha.headers },
      })
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          onStepChange("otp", email)
          return
        }
        setError(resolveAuthRefusal(result.error, captcha.reset))
        return
      }
      completeSignIn()
    } finally {
      setLoading(false)
    }
  }

  async function handleSocial(provider: FournisseurSocial) {
    setError(null)
    setNotice(null)
    const result = await authClient.signIn.social({
      provider,
      callbackURL: socialSignInDestination(pageAddress),
      errorCallbackURL: socialSignInDestination(errorDestination),
    })
    if (result.error) setError(translateAuthError(result.error))
  }

  function completeSignIn() {
    if (next) {
      window.location.href = next
      return
    }
    onSuccess?.()
  }

  function setEmail(value: string) {
    onStepChange(step, value)
  }

  function backToForm() {
    onStepChange("form", email)
    setError(null)
  }

  return {
    next,
    email,
    setEmail,
    password,
    setPassword,
    otp,
    step,
    error,
    notice,
    loading,
    captcha,
    handleSignIn,
    handleSocial,
    backToForm,
  }
}

function socialSignInDestination(pageAddress: string) {
  return new URL(pageAddress, window.location.origin).toString()
}
