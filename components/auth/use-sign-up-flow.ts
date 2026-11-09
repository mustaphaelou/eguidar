"use client"

import { useState } from "react"

import type { AuthFlowStep } from "@/components/auth/auth-dialog"
import { resolveAuthRefusal } from "@/components/auth/auth-form-glue"
import type { PortAuthentification } from "@/components/auth/port-authentification"
import { portAuthentificationClient } from "@/components/auth/port-authentification-client"
import { useOtpExchange } from "@/components/auth/verification-de-l-email"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import { ACTIONS_TEST_DE_SECURITE } from "@/lib/vocabulaire-test-de-securite"

export function useSignUpFlow(
  {
    step,
    email,
    onStepChange,
    onVerified,
  }: {
    step: AuthFlowStep
    email: string
    onStepChange: (step: AuthFlowStep, email: string) => void
    onVerified?: (email: string) => void
  },
  port: PortAuthentification = portAuthentificationClient
) {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useTestDeSecurite(ACTIONS_TEST_DE_SECURITE.inscription)
  const otp = useOtpExchange(
    { email, type: "email-verification", onVerified },
    port
  )

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await port.inscription({
        nom: name,
        email,
        motDePasse: password,
        entetes: captcha.headers,
      })
      if (result.error) {
        setError(resolveAuthRefusal(result.error, captcha.reset))
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
