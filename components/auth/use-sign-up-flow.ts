"use client"

import { useState } from "react"

import type { AuthFlowStep } from "@/components/auth/auth-dialog"
import {
  isCaptchaRejection,
  translateAuthError,
} from "@/components/auth/auth-form-glue"
import { useOtpExchange } from "@/components/auth/verification-de-l-email"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import { authClient } from "@/lib/client"

export function useSignUpFlow({
  step,
  email,
  onStepChange,
  onVerified,
}: {
  step: AuthFlowStep
  email: string
  onStepChange: (step: AuthFlowStep, email: string) => void
  onVerified?: (email: string) => void
}) {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useTestDeSecurite()
  const otp = useOtpExchange({ email, type: "email-verification", onVerified })

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        fetchOptions: { headers: captcha.headers },
      })
      if (result.error) {
        if (isCaptchaRejection(result.error)) {
          captcha.reset()
        }
        setError(translateAuthError(result.error))
        return
      }
      onStepChange("otp", email)
    } finally {
      setLoading(false)
    }
  }

  function setEmail(value: string) {
    onStepChange(step, value)
  }

  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    otp,
    step,
    error,
    loading,
    captcha,
    handleSignUp,
  }
}
