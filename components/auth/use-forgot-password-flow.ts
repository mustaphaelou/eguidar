"use client"

import { useState } from "react"

import { translateAuthError } from "./auth-form-glue"
import { useOtpExchange } from "./verification-de-l-email"
import { resetPasswordSchema } from "@/lib/auth-form-schemas"
import { authClient } from "@/lib/client"

export type ForgotPasswordStep = "email" | "otp" | "success"

export function useForgotPasswordFlow() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [step, setStep] = useState<ForgotPasswordStep>("email")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const otp = useOtpExchange({
    email,
    type: "forget-password",
    onSent: () => setStep("otp"),
  })

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const saisie = resetPasswordSchema.safeParse({ password, confirmPassword })
    if (!saisie.success) {
      setError(saisie.error.issues[0]!.message)
      return
    }

    setLoading(true)
    try {
      const result = await authClient.emailOtp.resetPassword({
        email,
        otp: otp.otp,
        password,
      })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      setStep("success")
    } finally {
      setLoading(false)
    }
  }

  function backToEmail() {
    setStep("email")
    setError(null)
  }

  return {
    email,
    setEmail,
    otp,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    step,
    error,
    loading,
    handleResetPassword,
    backToEmail,
  }
}
