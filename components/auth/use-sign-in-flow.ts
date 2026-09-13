"use client"

import { useState } from "react"

import { useAuthDialogDestination } from "@/components/auth/auth-dialogs"
import { translateAuthError } from "@/components/auth/auth-form-glue"
import { useOtpExchange } from "@/components/auth/verification-de-l-email"
import {
  isCaptchaRejection,
  useTestDeSecurite,
} from "@/components/auth/test-de-securite"
import { authClient } from "@/lib/client"
import { withoutAuthParams } from "@/lib/lien-de-connexion"

export type SignInStep = "form" | "otp"

export type SignInFlow = ReturnType<typeof useSignInFlow>

export function useSignInFlow({
  initialEmail,
  onSuccess,
}: {
  initialEmail?: string
  onSuccess?: () => void
} = {}) {
  const next = useAuthDialogDestination()
  const [email, setEmail] = useState(initialEmail ?? "")
  const [password, setPassword] = useState("")
  const [step, setStep] = useState<SignInStep>("form")
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
          setStep("otp")
          return
        }
        if (isCaptchaRejection(result.error)) {
          captcha.reset()
        }
        setError(translateAuthError(result.error))
        return
      }
      completeSignIn()
    } finally {
      setLoading(false)
    }
  }

  async function handleSocial(provider: "facebook" | "google") {
    setError(null)
    setNotice(null)
    const result = await authClient.signIn.social({
      provider,
      callbackURL: socialSignInDestination(),
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

  function backToForm() {
    setStep("form")
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

function socialSignInDestination() {
  return new URL(
    withoutAuthParams(window.location.href),
    window.location.origin
  ).toString()
}
