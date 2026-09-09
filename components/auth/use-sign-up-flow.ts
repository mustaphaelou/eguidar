"use client"

import { useState } from "react"

import { translateAuthError } from "@/components/auth/auth-form-glue"
import { useOtpExchange } from "@/components/auth/verification-de-l-email"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import { authClient } from "@/lib/client"

export type SignUpStep = "form" | "otp"

export function useSignUpFlow({
  initialEmail,
  onVerified,
}: {
  initialEmail?: string
  onVerified?: (email: string) => void
} = {}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState(initialEmail ?? "")
  const [password, setPassword] = useState("")
  const [step, setStep] = useState<SignUpStep>("form")
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
        if (
          result.error.code === "MISSING_RESPONSE" ||
          result.error.code === "INVALID_RESPONSE"
        ) {
          captcha.reset()
        }
        setError(translateAuthError(result.error))
        return
      }
      setStep("otp")
    } finally {
      setLoading(false)
    }
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
